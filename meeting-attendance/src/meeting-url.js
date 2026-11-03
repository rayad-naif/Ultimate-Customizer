'use strict';
/* Works out which platform an appointment's meeting link belongs to.
   GHL stores the join URL in the appointment's `address` field. */

function firstUrl(text) {
  const m = String(text || '').match(/https?:\/\/[^\s<>"')]+/i);
  if (!m) return null;
  try { return new URL(m[0]); } catch (e) { return null; }
}

function detectMeeting(address) {
  const u = firstUrl(address);
  if (!u) return null;
  const host = u.hostname.toLowerCase();
  const path = u.pathname;

  if (host === 'zoom.us' || host.endsWith('.zoom.us') || host.endsWith('.zoomgov.com')) {
    const m = path.match(/\/(?:j|w|s|wc\/join)\/(\d{9,12})/);
    if (m) return { provider: 'zoom', meetingId: m[1], url: u.toString() };
    const my = path.match(/\/my\/([^/?#]+)/);
    if (my) return { provider: 'zoom', vanity: my[1], url: u.toString() };
    return null;
  }
  if (host === 'teams.live.com') return { provider: 'teams', unsupported: 'personal', url: u.toString() };
  if (host === 'teams.microsoft.com' || host.endsWith('.teams.microsoft.com') || host === 'teams.microsoft.us') {
    if (path.includes('/l/meetup-join/')) return { provider: 'teams', joinUrl: u.toString(), url: u.toString() };
    const m = path.match(/\/meet\/(\d+)/);
    if (m) return { provider: 'teams', meetingCode: m[1], passcode: u.searchParams.get('p') || '', url: u.toString() };
    return null;
  }
  if (host === 'meet.google.com') {
    const m = path.match(/^\/([a-z]{3}-[a-z]{4}-[a-z]{3})/i);
    if (m) return { provider: 'meet', code: m[1].toLowerCase(), url: u.toString() };
  }
  return null;
}

module.exports = { detectMeeting, firstUrl };
