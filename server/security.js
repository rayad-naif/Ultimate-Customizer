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
const scrypt = (pw, salt) => new Promise((resolve, reject) => {
  crypto.scrypt(String(pw), salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (e, k) => (e ? reject(e) : resolve(k)));
});
async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  return 'scrypt$' + b64u(salt) + '$' + b64u(await scrypt(pw, salt));
}
const DUMMY_HASH_PROMISE = hashPassword('uc-dummy-password');
async function verifyPassword(pw, stored) {
  const real = typeof stored === 'string' && stored.startsWith('scrypt$') && stored.split('$').length === 3;
  const parts = (real ? stored : await DUMMY_HASH_PROMISE).split('$');
  const want = Buffer.from(parts[2], 'base64url');
  const got = await scrypt(pw, Buffer.from(parts[1], 'base64url'));
  return crypto.timingSafeEqual(want, got) && real;
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

module.exports = { createSecurity, randomToken, sha256, safeEqual, rateLimiter, hashPassword, verifyPassword };

/* CRM custom-page SSO: the payload is CryptoJS.AES.encrypt(JSON, sharedSecret),
   i.e. OpenSSL "Salted__" format, key+iv from EVP_BytesToKey(MD5), AES-256-CBC. */
function decryptGhlSso(payload, key) {
  try {
    const raw = Buffer.from(String(payload || ''), 'base64');
    if (raw.length < 32 || raw.subarray(0, 8).toString('latin1') !== 'Salted__' || !key) return null;
    const salt = raw.subarray(8, 16);
    let d = Buffer.alloc(0), prev = Buffer.alloc(0);
    while (d.length < 48) {
      prev = crypto.createHash('md5').update(Buffer.concat([prev, Buffer.from(key, 'utf8'), salt])).digest();
      d = Buffer.concat([d, prev]);
    }
    const dec = crypto.createDecipheriv('aes-256-cbc', d.subarray(0, 32), d.subarray(32, 48));
    const out = Buffer.concat([dec.update(raw.subarray(16)), dec.final()]).toString('utf8');
    const obj = JSON.parse(out);
    return obj && typeof obj === 'object' ? obj : null;
  } catch (e) { return null; }
}

module.exports.decryptGhlSso = decryptGhlSso;
