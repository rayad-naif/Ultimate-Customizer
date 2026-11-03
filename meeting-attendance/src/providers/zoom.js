'use strict';
/* Zoom (user-managed OAuth app).
   Attendance: Report API participants (paid plans), falling back to the Past
   Meeting participants API. Notes: AI Companion meeting summary, else the
   cloud-recording transcript (VTT). */
const { vttToText } = require('../vtt');

const API = 'https://api.zoom.us/v2';
const MATCH_WINDOW_MS = 60 * 60 * 1000;

// Zoom requires double encoding for UUIDs that start with "/" or contain "//".
const encUuid = (u) => (u.startsWith('/') || u.includes('//') ? encodeURIComponent(encodeURIComponent(u)) : encodeURIComponent(u));

function createZoom({ cfg, http }) {
  const z = cfg.zoom;
  const basic = () => 'Basic ' + Buffer.from(z.clientId + ':' + z.clientSecret).toString('base64');
  const redirectUri = cfg.baseUrl + '/connect/zoom/callback';

  async function account(accessToken) {
    const me = await http.request(API + '/users/me', { headers: { Authorization: 'Bearer ' + accessToken } });
    return {
      id: me.id,
      email: (me.email || '').toLowerCase(),
      name: me.display_name || [me.first_name, me.last_name].filter(Boolean).join(' '),
      pmi: me.pmi ? String(me.pmi) : null,
      vanity: me.vanity_url || null
    };
  }

  return {
    name: 'zoom',
    label: 'Zoom',
    configured: () => !!(z.clientId && z.clientSecret),
    authorizeUrl(state) {
      const u = new URL('https://zoom.us/oauth/authorize');
      u.searchParams.set('response_type', 'code');
      u.searchParams.set('client_id', z.clientId);
      u.searchParams.set('redirect_uri', redirectUri);
      u.searchParams.set('state', state);
      return u.toString();
    },
    async exchange(code) {
      const t = await http.request('https://zoom.us/oauth/token', {
        method: 'POST', headers: { Authorization: basic() }, retries: 1,
        form: { grant_type: 'authorization_code', code, redirect_uri: redirectUri }
      });
      return { token: t, account: await account(t.access_token) };
    },
    refresh(refreshToken) {
      return http.request('https://zoom.us/oauth/token', {
        method: 'POST', headers: { Authorization: basic() }, retries: 1,
        form: { grant_type: 'refresh_token', refresh_token: refreshToken }
      });
    },
    async revoke(accessToken) {
      await http.request('https://zoom.us/oauth/revoke', { method: 'POST', headers: { Authorization: basic() }, form: { token: accessToken }, retries: 0 });
    },

    /* ctx: { token(), account, meeting, window: {start, end} } */
    async getAttendance(ctx) {
      const auth = { Authorization: 'Bearer ' + (await ctx.token()) };
      let meetingId = ctx.meeting.meetingId;
      if (!meetingId && ctx.meeting.vanity) meetingId = ctx.account.pmi;
      if (!meetingId) return { status: 'not_found', reason: 'Zoom link has no meeting number' };

      // Every past instance of this meeting number (a reused room can host many appointments).
      let instances = [];
      try {
        const r = await http.request(API + '/past_meetings/' + encodeURIComponent(meetingId) + '/instances', { headers: auth });
        instances = (r && r.meetings) || [];
      } catch (e) { if (e.status !== 404 && e.status !== 400) throw e; }
      if (!instances.length) {
        try {
          const last = await http.request(API + '/past_meetings/' + encodeURIComponent(meetingId), { headers: auth });
          if (last && last.uuid) instances = [{ uuid: last.uuid, start_time: last.start_time }];
        } catch (e) { if (e.status !== 404 && e.status !== 400) throw e; }
      }
      const { start, end } = ctx.window;
      const picked = instances.filter((m) => {
        const t = Date.parse(m.start_time);
        return t >= start - MATCH_WINDOW_MS && t <= end;
      });
      if (!picked.length) return { status: 'not_found', reason: 'No Zoom meeting held in the appointment window' };

      const participants = [];
      for (const inst of picked) {
        let hostId = null;
        try { hostId = (await http.request(API + '/past_meetings/' + encUuid(inst.uuid), { headers: auth })).host_id || null; } catch (e) { /* optional */ }
        const rows = await listParticipants(auth, inst.uuid);
        for (const p of rows) {
          const join = Date.parse(p.join_time), leave = Date.parse(p.leave_time) || join + (Number(p.duration) || 0) * 1000;
          if (!join) continue;
          const email = (p.user_email || p.email || '').toLowerCase();
          participants.push({
            name: p.name || p.user_name || '',
            email,
            isHost: !!((hostId && (p.id === hostId || p.user_id === hostId)) || (email && email === ctx.account.email)),
            sessions: [{ start: join, end: leave }]
          });
        }
      }
      if (!participants.length) return { status: 'pending', reason: 'Zoom participant report not ready yet' };
      return { status: 'ready', participants, ref: { uuids: picked.map((p) => p.uuid) } };
    },

    async getNotesSource(ctx) {
      const auth = { Authorization: 'Bearer ' + (await ctx.token()) };
      const uuids = (ctx.ref && ctx.ref.uuids) || [];
      if (!uuids.length) return { status: 'none' };
      let sawRecording = false;
      for (const uuid of uuids) {
        // 1) AI Companion summary, if the host has it on.
        try {
          const s = await http.request(API + '/meetings/' + encUuid(uuid) + '/meeting_summary', { headers: auth, retries: 0 });
          const text = summaryText(s);
          if (text) return { status: 'ready', kind: 'summary', text };
        } catch (e) { if (![400, 403, 404].includes(e.status)) throw e; }
        // 2) Cloud recording transcript.
        try {
          const rec = await http.request(API + '/meetings/' + encUuid(uuid) + '/recordings', { headers: auth, retries: 0 });
          const files = (rec && rec.recording_files) || [];
          if (files.length) sawRecording = true;
          const tr = files.find((f) => f.file_type === 'TRANSCRIPT' && (!f.status || f.status === 'completed'));
          if (tr && tr.download_url) {
            const res = await http.request(tr.download_url, { headers: auth, raw: true });
            const text = vttToText(await res.text());
            if (text) return { status: 'ready', kind: 'transcript', text };
          }
        } catch (e) { if (![400, 403, 404].includes(e.status)) throw e; }
      }
      // A recording exists but the transcript is still processing, or summaries may still arrive.
      return { status: sawRecording ? 'pending' : 'maybe' };
    }
  };

  async function listParticipants(auth, uuid) {
    const all = [];
    const paths = ['/report/meetings/' + encUuid(uuid) + '/participants', '/past_meetings/' + encUuid(uuid) + '/participants'];
    for (const p of paths) {
      try {
        let next = '';
        do {
          const q = '?page_size=300' + (next ? '&next_page_token=' + encodeURIComponent(next) : '');
          const r = await http.request(API + p + q, { headers: auth });
          all.push(...((r && r.participants) || []));
          next = (r && r.next_page_token) || '';
        } while (next);
        return all;
      } catch (e) {
        if (![400, 403, 404].includes(e.status)) throw e;
      }
    }
    return all;
  }
}

/* Zoom's summary payload has changed shape over time; accept all known forms. */
function summaryText(s) {
  if (!s) return '';
  if (s.summary_content) return String(s.summary_content).trim();
  const parts = [];
  if (s.summary_overview) parts.push(s.summary_overview);
  for (const d of s.summary_details || []) parts.push((d.label ? d.label + ': ' : '') + (d.summary || ''));
  const steps = s.next_steps || [];
  if (steps.length) parts.push('Next steps:\n' + steps.map((x) => '- ' + (typeof x === 'string' ? x : x.text || JSON.stringify(x))).join('\n'));
  return parts.join('\n\n').trim();
}

module.exports = { createZoom, summaryText };
