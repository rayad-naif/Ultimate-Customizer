'use strict';
/* Small fetch wrapper: JSON or form bodies, timeouts, one retry on 429/5xx. */
class HttpError extends Error {
  constructor(message, status, body) { super(message); this.name = 'HttpError'; this.status = status; this.body = body; }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function createHttp(fetchImpl) {
  const doFetch = fetchImpl || fetch;
  async function request(url, opts = {}) {
    const headers = Object.assign({ Accept: 'application/json' }, opts.headers || {});
    let body;
    if (opts.form) {
      body = new URLSearchParams(opts.form).toString();
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
    } else if (opts.json !== undefined) {
      body = JSON.stringify(opts.json);
      headers['Content-Type'] = 'application/json';
    }
    const tries = opts.retries == null ? 2 : opts.retries;
    for (let attempt = 0; ; attempt++) {
      let res;
      try {
        res = await doFetch(url, { method: opts.method || 'GET', headers, body, signal: AbortSignal.timeout(opts.timeoutMs || 20000) });
      } catch (e) {
        if (attempt < tries) { await sleep(500 * (attempt + 1)); continue; }
        throw new HttpError('Network error calling ' + new URL(url).host + ': ' + e.message, 0, null);
      }
      if ((res.status === 429 || res.status >= 500) && attempt < tries) {
        const ra = Number(res.headers && res.headers.get && res.headers.get('retry-after'));
        await sleep(Math.min(ra > 0 ? ra * 1000 : 800 * (attempt + 1), 5000));
        continue;
      }
      const text = opts.raw ? null : await res.text();
      if (opts.raw) {
        if (!res.ok) throw new HttpError('HTTP ' + res.status + ' from ' + new URL(url).host, res.status, await res.text());
        return res;
      }
      let json = null;
      try { json = text ? JSON.parse(text) : null; } catch (e) { /* not json */ }
      if (!res.ok) {
        const err = new HttpError('HTTP ' + res.status + ' from ' + new URL(url).host + new URL(url).pathname, res.status, json || text);
        throw err;
      }
      return json != null ? json : text;
    }
  }
  return { request };
}

module.exports = { createHttp, HttpError };
