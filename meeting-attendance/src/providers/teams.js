'use strict';
/* Microsoft Teams via Microsoft Graph (delegated permissions, work/school accounts).
   Attendance: onlineMeetings/{id}/attendanceReports + attendanceRecords.
   Notes: onlineMeetings/{id}/transcripts/{id}/content (VTT). */
const { vttToText } = require('../vtt');

const GRAPH = 'https://graph.microsoft.com/v1.0';
const SCOPES = 'offline_access openid email profile User.Read OnlineMeetings.Read OnlineMeetingArtifact.Read.All OnlineMeetingTranscript.Read.All';
const MATCH_WINDOW_MS = 60 * 60 * 1000;

function createTeams({ cfg, http }) {
  const m = cfg.microsoft;
  const base = 'https://login.microsoftonline.com/' + encodeURIComponent(m.tenant) + '/oauth2/v2.0';
  const redirectUri = cfg.baseUrl + '/connect/teams/callback';

  async function findMeeting(auth, meeting) {
    const filter = meeting.joinUrl
      ? "JoinWebUrl eq '" + meeting.joinUrl.replace(/'/g, "''") + "'"
      : "joinMeetingIdSettings/joinMeetingId eq '" + meeting.meetingCode + "'";
    const r = await http.request(GRAPH + '/me/onlineMeetings?$filter=' + encodeURIComponent(filter), { headers: auth });
    return ((r && r.value) || [])[0] || null;
  }

  return {
    name: 'teams',
    label: 'Microsoft Teams',
    configured: () => !!(m.clientId && m.clientSecret),
    authorizeUrl(state) {
      const u = new URL(base + '/authorize');
      u.searchParams.set('client_id', m.clientId);
      u.searchParams.set('response_type', 'code');
      u.searchParams.set('redirect_uri', redirectUri);
      u.searchParams.set('response_mode', 'query');
      u.searchParams.set('scope', SCOPES);
      u.searchParams.set('state', state);
      return u.toString();
    },
    async exchange(code) {
      const t = await http.request(base + '/token', {
        method: 'POST', retries: 1,
        form: { client_id: m.clientId, client_secret: m.clientSecret, grant_type: 'authorization_code', code, redirect_uri: redirectUri, scope: SCOPES }
      });
      const me = await http.request(GRAPH + '/me', { headers: { Authorization: 'Bearer ' + t.access_token } });
      return { token: t, account: { id: me.id, email: (me.mail || me.userPrincipalName || '').toLowerCase(), name: me.displayName || '' } };
    },
    refresh(refreshToken) {
      return http.request(base + '/token', {
        method: 'POST', retries: 1,
        form: { client_id: m.clientId, client_secret: m.clientSecret, grant_type: 'refresh_token', refresh_token: refreshToken, scope: SCOPES }
      });
    },

    async getAttendance(ctx) {
      if (ctx.meeting.unsupported) return { status: 'not_found', reason: 'Personal Teams (teams.live.com) meetings have no attendance API' };
      const auth = { Authorization: 'Bearer ' + (await ctx.token()) };
      const om = await findMeeting(auth, ctx.meeting);
      if (!om) return { status: 'not_found', reason: 'Teams meeting not found for the connected account (it must be the organizer)' };
      const reports = ((await http.request(GRAPH + '/me/onlineMeetings/' + encodeURIComponent(om.id) + '/attendanceReports', { headers: auth })) || {}).value || [];
      const { start, end } = ctx.window;
      const picked = reports.filter((r) => {
        const t = Date.parse(r.meetingStartDateTime);
        return t >= start - MATCH_WINDOW_MS && t <= end;
      });
      if (!picked.length) return { status: reports.length ? 'not_found' : 'pending', reason: 'No Teams attendance report for the appointment window yet' };
      const participants = [];
      for (const rep of picked) {
        let url = GRAPH + '/me/onlineMeetings/' + encodeURIComponent(om.id) + '/attendanceReports/' + encodeURIComponent(rep.id) + '/attendanceRecords';
        while (url) {
          const r = await http.request(url, { headers: auth });
          for (const rec of (r && r.value) || []) {
            const sessions = (rec.attendanceIntervals || []).map((i) => ({ start: Date.parse(i.joinDateTime), end: Date.parse(i.leaveDateTime) })).filter((s) => s.start);
            participants.push({
              name: (rec.identity && rec.identity.displayName) || '',
              email: (rec.emailAddress || '').toLowerCase(),
              isHost: rec.role === 'Organizer',
              sessions
            });
          }
          url = r && r['@odata.nextLink'];
        }
      }
      return { status: 'ready', participants, ref: { meetingId: om.id, from: picked[0].meetingStartDateTime } };
    },

    async getNotesSource(ctx) {
      const auth = { Authorization: 'Bearer ' + (await ctx.token()) };
      const id = ctx.ref && ctx.ref.meetingId;
      if (!id) return { status: 'none' };
      const list = ((await http.request(GRAPH + '/me/onlineMeetings/' + encodeURIComponent(id) + '/transcripts', { headers: auth })) || {}).value || [];
      const from = Date.parse(ctx.ref.from || 0) - MATCH_WINDOW_MS;
      const tr = list.filter((t) => Date.parse(t.createdDateTime) >= from).sort((a, b) => Date.parse(a.createdDateTime) - Date.parse(b.createdDateTime))[0];
      if (!tr) return { status: 'maybe' };
      const res = await http.request(GRAPH + '/me/onlineMeetings/' + encodeURIComponent(id) + '/transcripts/' + encodeURIComponent(tr.id) + '/content?$format=text/vtt', { headers: auth, raw: true });
      const text = vttToText(await res.text());
      return text ? { status: 'ready', kind: 'transcript', text } : { status: 'pending' };
    }
  };
}

module.exports = { createTeams };
