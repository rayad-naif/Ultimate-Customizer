'use strict';
/* Scheduling and processing. One job per meeting (a class booking = one job
   holding every attendee's appointment id). Stage 1 marks attendance, stage 2
   posts notes. Jobs hold pointers only; GHL is re-read at run time. */
const nodeCrypto = require('crypto');
const { detectMeeting } = require('./meeting-url');
const { decideAttendance } = require('./attendance');
const { forCalendar } = require('./settings');
const { fieldValue } = require('./fields');
const { buildNote, splitNote, NotesUnavailable } = require('./notes');
const { ConnectionError } = require('./providers');

const ATTENDANCE_RETRY_MIN = [10, 20, 30, 60, 180, 360];
const NOTES_RETRY_MIN = [15, 30, 60, 120, 240];
const MAYBE_NOTES_TRIES = 3; // no recording/summary seen: give up sooner
const ERROR_RETRY_MIN = [5, 15, 60, 240];
const LEASE_MS = 10 * 60 * 1000;
const ACTIONABLE = ['new', 'confirmed'];
const DEAD = ['cancelled', 'invalid'];
const PLATFORM = { zoom: 'Zoom', teams: 'Microsoft Teams', meet: 'Google Meet' };

const meetingIdentity = (m) => m.provider + ':' + (m.meetingId || m.vanity || m.joinUrl || m.meetingCode || m.code || m.url);
const jobKey = (loc, cal, start, m) => nodeCrypto.createHash('sha1').update([loc, cal || '', start, meetingIdentity(m)].join('|')).digest('hex').slice(0, 24);
const minutes = (n) => n * 60000;

function createJobs({ cfg, store, ghl, providers, settings, fields, notes, now = () => Date.now() }) {

  /* ---------- scheduling (from webhooks) ---------- */
  async function onAppointment(locationId, appt, type) {
    if (!appt || !appt.id) return 'ignored';
    if (type === 'AppointmentDelete' || DEAD.includes(appt.appointmentStatus)) {
      await store.unscheduleEvent(locationId, appt.id, null);
      return 'unscheduled';
    }
    const meeting = detectMeeting(appt.address);
    const start = Date.parse(appt.startTime);
    if (!meeting || !start) { await store.unscheduleEvent(locationId, appt.id, null); return 'no-meeting-link'; }
    const end = Date.parse(appt.endTime) || start + minutes(30);
    if (end < now() - 7 * 86400e3) return 'too-old';
    let delay = 10;
    try { delay = forCalendar(await settings.get(locationId), appt.calendarId).delayMinutes; } catch (e) { /* default */ }
    const key = jobKey(locationId, appt.calendarId, start, meeting);
    await store.unscheduleEvent(locationId, appt.id, key);
    await store.scheduleEvent({
      key, locationId, eventId: appt.id, calendarId: appt.calendarId || null,
      startTime: start, endTime: end, address: String(appt.address).slice(0, 1000), dueAt: new Date(end + minutes(delay))
    });
    return 'scheduled';
  }

  /* ---------- runner ---------- */
  async function runDue(budgetMs) {
    const stopAt = now() + (budgetMs || cfg.cronBudgetSeconds * 1000);
    const stats = { processed: 0, errors: 0 };
    while (now() < stopAt) {
      const batch = await store.claimDue(new Date(now()), 3, LEASE_MS);
      if (!batch.length) break;
      await Promise.all(batch.map(async (job) => {
        try { await processJob(job); stats.processed++; } catch (e) {
          stats.errors++;
          await failJob(job, e);
        }
      }));
    }
    return stats;
  }

  async function retry(job, schedule, reason) {
    if (job.attempts >= schedule.length) return false;
    job.dueAt = new Date(now() + minutes(schedule[job.attempts]));
    job.attempts += 1;
    job.leaseUntil = new Date(0);
    job.lastReason = String(reason || '').slice(0, 200);
    await store.saveJob(stripRuntime(job));
    return true;
  }

  async function failJob(job, e) {
    const msg = (e && e.message) || String(e);
    await store.log(job.locationId, 'job_error', job.stage + ': ' + msg);
    job.errors = (job.errors || 0) + 1;
    if (e instanceof ConnectionError || job.errors > ERROR_RETRY_MIN.length) {
      await store.log(job.locationId, 'job_dropped', job.stage + ' gave up: ' + msg);
      if (job.stage === 'attendance') await reviewAll(job, 'Attendance could not be checked automatically: ' + msg).catch(() => {});
      await store.deleteJob(job._id);
      return;
    }
    job.dueAt = new Date(now() + minutes(ERROR_RETRY_MIN[job.errors - 1]));
    job.leaseUntil = new Date(0);
    await store.saveJob(stripRuntime(job));
  }

  async function processJob(job) {
    const loc = await store.getLocation(job.locationId);
    if (!loc || !loc.installed) { await store.deleteJob(job._id); return; }
    if (job.stage === 'notes') return doNotes(job, loc);
    return doAttendance(job, loc);
  }

  async function loadAppointments(job) {
    const out = [];
    for (const id of job.eventIds) {
      try {
        const a = await ghl.getAppointment(job.locationId, id);
        if (!a || DEAD.includes(a.appointmentStatus)) continue;
        const m = detectMeeting(a.address);
        if (!m || meetingIdentity(m) !== meetingIdentity(detectMeeting(job.address)) || Date.parse(a.startTime) !== job.startTime) continue;
        out.push(a);
      } catch (e) { if (e.status !== 404 && e.status !== 400) throw e; }
    }
    return out;
  }

  async function reviewAll(job, reason) {
    const appts = job.appts || (await loadAppointments(job));
    const s = forCalendar(await settings.get(job.locationId), job.calendarId);
    for (const a of appts) {
      if (!ACTIONABLE.includes(a.appointmentStatus) || !a.contactId) continue;
      await createReviewTask(job.locationId, a, s, reason, []);
    }
  }

  async function createReviewTask(locationId, a, s, reason, unmatched) {
    const body = [
      'Appointment: ' + (a.title || 'Meeting') + ' at ' + new Date(Date.parse(a.startTime)).toISOString(),
      'Reason: ' + reason,
      unmatched && unmatched.length ? 'Unidentified participants: ' + unmatched.map((u) => (u.name || u.email || 'unknown') + ' (' + u.minutes + ' min)').join(', ') : '',
      'Please set the appointment to Showed or No-show in the calendar.'
    ].filter(Boolean).join('\n');
    await ghl.createTask(locationId, a.contactId, {
      title: 'Check meeting attendance: ' + (a.title || 'Meeting'),
      body, dueDate: new Date(now()).toISOString(),
      ...(a.assignedUserId ? { assignedTo: a.assignedUserId } : {})
    });
    if (s.tags.review) await ghl.addTags(locationId, a.contactId, [s.tags.review]).catch(() => {});
  }

  /* ---------- stage 1: attendance ---------- */
  async function doAttendance(job, loc) {
    const s = forCalendar(await settings.get(job.locationId), job.calendarId);
    if (s.mode === 'off') { await store.deleteJob(job._id); return; }
    const appts = await loadAppointments(job);
    if (!appts.length) { await store.deleteJob(job._id); return; }
    job.appts = appts;
    const meeting = detectMeeting(job.address);
    const provider = providers.get(meeting.provider);
    const conn = await providers.context(job.locationId, meeting.provider);
    if (!conn) {
      await store.log(job.locationId, 'not_connected', provider.label + ' is not connected; skipped ' + (appts[0].title || 'appointment'));
      await store.deleteJob(job._id);
      return;
    }
    const window = { start: job.startTime, end: job.endTime };
    const att = await provider.getAttendance(Object.assign({}, conn, { meeting, window }));
    if (att.status !== 'ready') {
      if (await retry(job, ATTENDANCE_RETRY_MIN, att.reason || att.status)) return;
      await store.log(job.locationId, 'meeting_not_found', att.reason || att.status);
      if (s.noMeeting === 'review') await reviewAll(job, att.reason || 'The meeting could not be found on ' + provider.label);
      await store.deleteJob(job._id);
      return;
    }

    // Booked attendees and the people to exclude (staff and the connected host account).
    const attendees = [];
    for (const a of appts) {
      if (!a.contactId) continue;
      const c = await ghl.getContact(job.locationId, a.contactId);
      if (c) attendees.push({ eventId: a.id, appt: a, contact: c });
    }
    const hosts = { emails: [conn.account.email].filter(Boolean), names: [conn.account.name].filter(Boolean) };
    const userIds = [...new Set(appts.flatMap((a) => [a.assignedUserId, ...(a.users || [])]).filter(Boolean))];
    for (const uid of userIds.slice(0, 10)) {
      try {
        const u = await ghl.getUser(job.locationId, uid);
        if (u) { if (u.email) hosts.emails.push(u.email); const n = u.name || [u.firstName, u.lastName].filter(Boolean).join(' '); if (n) hosts.names.push(n); }
      } catch (e) { /* user lookup is optional */ }
    }

    const verdict = decideAttendance({ participants: att.participants, attendees, hosts, window, rules: s });
    const fieldIds = s.updateFields ? await fields.ensure(job.locationId) : {};
    job.done = job.done || {};
    const results = [];
    for (const r of verdict.results) {
      const at = attendees.find((x) => x.eventId === r.eventId);
      const a = at.appt;
      let final = r.decision, reason = r.reason;
      if (!ACTIONABLE.includes(a.appointmentStatus)) {
        final = a.appointmentStatus === 'showed' ? 'showed' : a.appointmentStatus === 'noshow' ? 'noshow' : 'skip';
        reason = 'Status was already ' + a.appointmentStatus + '; left unchanged';
      } else if (s.mode === 'review' && (final === 'showed' || final === 'noshow')) {
        reason = 'Review mode - suggested ' + (final === 'showed' ? 'Showed' : 'No-show') + ': ' + reason;
        final = 'review';
      } else if (final === 'review' && !verdict.happened && s.noMeeting === 'ignore') {
        final = 'skip';
      }
      results.push(Object.assign({}, r, { final, reason }));
      if (job.done[r.eventId] || !ACTIONABLE.includes(a.appointmentStatus)) continue;

      if (final === 'showed' || final === 'noshow') {
        await ghl.updateAppointmentStatus(job.locationId, a.id, final);
        const tags = [final === 'showed' ? s.tags.showed : s.tags.noshow, r.late && final === 'showed' ? s.tags.late : ''].filter(Boolean);
        if (tags.length) await ghl.addTags(job.locationId, a.contactId, tags);
        if (s.updateFields) await writeFields(job.locationId, at.contact, fieldIds, r, final, meeting.provider);
      } else if (final === 'review') {
        await createReviewTask(job.locationId, a, s, reason, verdict.unmatched);
      }
      job.done[r.eventId] = final;
      await store.saveJob(stripRuntime(job));
    }
    await store.log(job.locationId, 'attendance', (appts[0].title || 'Meeting') + ': ' + results.map((r) => r.final).join(', '));

    const isClass = job.eventIds.length > 1 || attendees.length > 1;
    const mode = isClass ? s.notes.classMode : s.notes.oneToOne;
    const recipients = results.filter((r) => r.final === 'showed');
    if (!s.notes.enabled || mode === 'off' || !recipients.length) { await store.deleteJob(job._id); return; }
    const next = stripRuntime(job);
    Object.assign(next, {
      stage: 'notes', attempts: 0, errors: 0, dueAt: new Date(now() + minutes(5)), leaseUntil: new Date(0), done: {},
      ref: att.ref || null,
      meta: { title: appts[0].title || 'Meeting', platform: PLATFORM[meeting.provider], start: job.startTime, end: job.endTime, userId: appts[0].assignedUserId || null, isClass, mode },
      results: recipients.map((r) => ({ eventId: r.eventId, contactId: r.contactId, contactName: r.contactName, decision: 'showed', minutes: r.minutes, pct: r.pct, joinedAt: r.joinedAt, late: r.late }))
    });
    await store.saveJob(next);
  }

  function stripRuntime(job) {
    const j = Object.assign({}, job);
    delete j.appts;
    return j;
  }

  async function writeFields(locationId, contact, ids, r, final, provider) {
    const set = [];
    const put = (k, v) => { if (ids[k] && v !== undefined && v !== null) set.push({ id: ids[k], field_value: v }); };
    put('lastStatus', final === 'showed' ? 'Showed' : 'No-show');
    put('lastMinutes', String(r.minutes || 0));
    put('lastPercent', String(r.pct || 0));
    put('lastJoined', r.joinedAt ? new Date(r.joinedAt).toISOString() : '');
    put('lastPlatform', PLATFORM[provider]);
    if (final === 'showed') put('attended', String((Number(fieldValue(contact, ids.attended)) || 0) + 1));
    else put('missed', String((Number(fieldValue(contact, ids.missed)) || 0) + 1));
    if (set.length) await ghl.updateContactFields(locationId, contact.id, set);
  }

  /* ---------- stage 2: notes ---------- */
  async function doNotes(job, loc) {
    const meta = job.meta;
    let summary = null;
    if (meta.mode !== 'attendance') {
      const meeting = detectMeeting(job.address);
      const provider = providers.get(meeting.provider);
      const conn = await providers.context(job.locationId, meeting.provider);
      const src = conn ? await provider.getNotesSource(Object.assign({}, conn, { meeting, ref: job.ref })) : { status: 'none' };
      if (src.status === 'pending' && (await retry(job, NOTES_RETRY_MIN, 'transcript not ready'))) return;
      if (src.status === 'maybe' && job.attempts < MAYBE_NOTES_TRIES && (await retry(job, NOTES_RETRY_MIN, 'no transcript yet'))) return;
      if (src.status === 'ready') {
        meta.sourceKind = src.kind;
        const personal = meta.mode === 'personal' ? job.results.map((r) => r.contactName).filter(Boolean) : null;
        try { summary = await notes.summarize(src, meta, personal); } catch (e) {
          if (!(e instanceof NotesUnavailable)) throw e;
          await store.log(job.locationId, 'notes_unavailable', e.message);
        }
      }
    }
    const s = await settings.get(job.locationId);
    if (!summary && !s.notes.attendanceOnlyNote) { await store.deleteJob(job._id); return; }

    if (!loc.timezone) {
      try { const info = await ghl.getLocationInfo(job.locationId); loc.timezone = (info && info.timezone) || 'UTC'; await store.saveLocation(loc); } catch (e) { loc.timezone = 'UTC'; }
    }
    const fieldIds = summary ? (loc.fieldIds || {}) : {};
    job.done = job.done || {};
    for (const r of job.results) {
      if (job.done[r.eventId]) continue;
      const body = buildNote({ meta, result: r, notes: summary, personalFor: meta.mode === 'personal' ? r.contactName : null, appName: cfg.appName, tz: loc.timezone });
      const parts = splitNote(body, cfg.noteMaxChars);
      // GHL lists newest notes first, so post the last part first.
      for (let i = parts.length - 1; i >= 0; i--) await ghl.addNote(job.locationId, r.contactId, parts[i], meta.userId || undefined);
      if (summary && fieldIds.lastSummary) {
        await ghl.updateContactFields(job.locationId, r.contactId, [{ id: fieldIds.lastSummary, field_value: String(summary.summary || '').slice(0, 2000) }]).catch(() => {});
      }
      job.done[r.eventId] = true;
      await store.saveJob(job);
    }
    await store.log(job.locationId, 'notes', meta.title + ': ' + job.results.length + ' note(s), ' + (summary ? 'AI summary' : 'attendance only'));
    await store.deleteJob(job._id);
  }

  return { onAppointment, runDue, processJob, jobKey };
}

module.exports = { createJobs, ATTENDANCE_RETRY_MIN, NOTES_RETRY_MIN };
