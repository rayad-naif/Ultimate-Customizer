'use strict';
/* Google Meet REST API v2.
   Attendance: conferenceRecords (filtered by meeting code) -> participants -> participantSessions.
   Notes: conferenceRecords/{id}/transcripts -> entries.
   Meet does not return emails for signed-in users, so matching relies on names. */
const API = 'https://meet.googleapis.com/v2';
const SCOPES = 'openid email profile https://www.googleapis.com/auth/meetings.space.readonly';
const MATCH_WINDOW_MS = 60 * 60 * 1000;
const SESSION_LOOKUP_LIMIT = 60;

function createMeet({ cfg, http }) {
  const g = cfg.google;
  const redirectUri = cfg.baseUrl + '/connect/meet/callback';

  async function pages(url, key, auth) {
    const out = [];
    let token = '';
    do {
      const sep = url.includes('?') ? '&' : '?';
      const r = await http.request(url + sep + 'pageSize=100' + (token ? '&pageToken=' + encodeURIComponent(token) : ''), { headers: auth });
      out.push(...((r && r[key]) || []));
      token = (r && r.nextPageToken) || '';
    } while (token);
    return out;
  }
  const displayName = (p) => (p.signedinUser && p.signedinUser.displayName) || (p.anonymousUser && p.anonymousUser.displayName) || (p.phoneUser && p.phoneUser.displayName) || '';

  return {
    name: 'meet',
    label: 'Google Meet',
    configured: () => !!(g.clientId && g.clientSecret),
    authorizeUrl(state) {
      const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      u.searchParams.set('client_id', g.clientId);
      u.searchParams.set('redirect_uri', redirectUri);
      u.searchParams.set('response_type', 'code');
      u.searchParams.set('access_type', 'offline');
      u.searchParams.set('prompt', 'consent');
      u.searchParams.set('include_granted_scopes', 'true');
      u.searchParams.set('scope', SCOPES);
      u.searchParams.set('state', state);
      return u.toString();
    },
    async exchange(code) {
      const t = await http.request('https://oauth2.googleapis.com/token', {
        method: 'POST', retries: 1,
        form: { client_id: g.clientId, client_secret: g.clientSecret, grant_type: 'authorization_code', code, redirect_uri: redirectUri }
      });
      const me = await http.request('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: 'Bearer ' + t.access_token } });
      return { token: t, account: { id: me.sub, email: (me.email || '').toLowerCase(), name: me.name || '' } };
    },
    refresh(refreshToken) {
      return http.request('https://oauth2.googleapis.com/token', {
        method: 'POST', retries: 1,
        form: { client_id: g.clientId, client_secret: g.clientSecret, grant_type: 'refresh_token', refresh_token: refreshToken }
      });
    },
    async revoke(accessToken) {
      await http.request('https://oauth2.googleapis.com/revoke', { method: 'POST', form: { token: accessToken }, retries: 0 });
    },

    async getAttendance(ctx) {
      const auth = { Authorization: 'Bearer ' + (await ctx.token()) };
      const filter = 'space.meeting_code = "' + ctx.meeting.code + '"';
      const records = await pages(API + '/conferenceRecords?filter=' + encodeURIComponent(filter), 'conferenceRecords', auth);
      const { start, end } = ctx.window;
      const picked = records.filter((r) => {
        const t = Date.parse(r.startTime);
        return t >= start - MATCH_WINDOW_MS && t <= end;
      });
      if (!picked.length) return { status: 'not_found', reason: 'No Google Meet conference held in the appointment window' };
      if (picked.some((r) => !r.endTime)) return { status: 'pending', reason: 'Meet conference has not ended yet' };
      const participants = [];
      for (const rec of picked) {
        const list = await pages(API + '/' + rec.name + '/participants', 'participants', auth);
        for (const p of list) {
          let sessions = [{ start: Date.parse(p.earliestStartTime), end: Date.parse(p.latestEndTime) || Date.parse(rec.endTime) }];
          if (list.length <= SESSION_LOOKUP_LIMIT) {
            try {
              const s = await pages(API + '/' + p.name + '/participantSessions', 'participantSessions', auth);
              if (s.length) sessions = s.map((x) => ({ start: Date.parse(x.startTime), end: Date.parse(x.endTime) || Date.parse(rec.endTime) }));
            } catch (e) { /* fall back to earliest/latest */ }
          }
          const userId = p.signedinUser && p.signedinUser.user ? String(p.signedinUser.user).replace(/^users\//, '') : '';
          participants.push({
            name: displayName(p),
            email: '',
            isHost: !!(userId && userId === ctx.account.id),
            sessions: sessions.filter((s) => s.start)
          });
        }
      }
      return { status: 'ready', participants, ref: { records: picked.map((r) => r.name) } };
    },

    async getNotesSource(ctx) {
      const auth = { Authorization: 'Bearer ' + (await ctx.token()) };
      const recs = (ctx.ref && ctx.ref.records) || [];
      if (!recs.length) return { status: 'none' };
      let pending = false;
      for (const rec of recs) {
        const trs = await pages(API + '/' + rec + '/transcripts', 'transcripts', auth);
        if (!trs.length) continue;
        const ready = trs.find((t) => t.state === 'FILE_GENERATED' || t.state === 'ENDED');
        if (!ready) { pending = true; continue; }
        const names = new Map();
        for (const p of await pages(API + '/' + rec + '/participants', 'participants', auth)) names.set(p.name, displayName(p));
        const entries = await pages(API + '/' + ready.name + '/entries', 'transcriptEntries', auth);
        const lines = [];
        let last = null;
        for (const e of entries) {
          const who = names.get(e.participant) || 'Speaker';
          if (last && last.who === who) last.text += ' ' + e.text;
          else { last = { who, text: e.text || '' }; lines.push(last); }
        }
        const text = lines.map((l) => l.who + ': ' + l.text).join('\n').trim();
        if (text) return { status: 'ready', kind: 'transcript', text };
      }
      return { status: pending ? 'pending' : 'maybe' };
    }
  };
}

module.exports = { createMeet };
