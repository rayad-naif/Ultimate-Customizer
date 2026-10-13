'use strict';
const crypto = require('crypto');

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const randomToken = (bytes) => b64u(crypto.randomBytes(bytes || 24));
const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  if (x.length !== y.length) { crypto.timingSafeEqual(x, x); return false; }
  return crypto.timingSafeEqual(x, y);
}

function createSecurity(secret) {
  const macKey = crypto.createHash('sha256').update('uc-mac:' + secret).digest();
  const encKey = crypto.createHash('sha256').update('uc-enc:' + secret).digest();
  const mac = (s) => crypto.createHmac('sha256', macKey).update(s).digest('base64url');

  // Signed, non-encrypted session payload: base64url(json).mac
  function sign(obj) {
    const body = b64u(JSON.stringify(obj));
    return body + '.' + mac(body);
  }
  function unsign(token) {
    if (typeof token !== 'string') return null;
    const i = token.lastIndexOf('.');
    if (i < 1) return null;
    const body = token.slice(0, i), sig = token.slice(i + 1);
    if (!safeEqual(sig, mac(body))) return null;
    try {
      const obj = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
      if (obj.exp && Date.now() > obj.exp) return null;
      return obj;
    } catch (e) { return null; }
  }

  // AES-256-GCM for OAuth tokens at rest.
  function encrypt(plain) {
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', encKey, iv);
    const enc = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
    return 'v1:' + b64u(iv) + ':' + b64u(c.getAuthTag()) + ':' + b64u(enc);
  }
  function decrypt(blob) {
    if (typeof blob !== 'string' || !blob.startsWith('v1:')) return null;
    try {
      const [, iv, tag, data] = blob.split(':');
      const d = crypto.createDecipheriv('aes-256-gcm', encKey, Buffer.from(iv, 'base64url'));
      d.setAuthTag(Buffer.from(tag, 'base64url'));
      return Buffer.concat([d.update(Buffer.from(data, 'base64url')), d.final()]).toString('utf8');
    } catch (e) { return null; }
  }

  return { sign, unsign, encrypt, decrypt };
}

// Tiny fixed-window rate limiter keyed by ip+bucket.
function rateLimiter(limit, windowMs) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  }, windowMs).unref();
  return function (key) {
    const now = Date.now();
    let h = hits.get(key);
    if (!h || h.reset < now) { h = { n: 0, reset: now + windowMs }; hits.set(key, h); }
    h.n += 1;
    return h.n <= limit;
  };
}

module.exports = { createSecurity, randomToken, sha256, safeEqual, rateLimiter };
