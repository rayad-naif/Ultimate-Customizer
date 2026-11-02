'use strict';
const crypto = require('crypto');

const b64u = (b) => Buffer.from(b).toString('base64url');

function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  if (x.length !== y.length) return false;
  return crypto.timingSafeEqual(x, y);
}

function createCrypto(secret) {
  const macKey = crypto.createHash('sha256').update('ma-mac:' + secret).digest();
  const encKey = crypto.createHash('sha256').update('ma-enc:' + secret).digest();
  const mac = (s) => crypto.createHmac('sha256', macKey).update(s).digest('base64url');

  /* Signed (not encrypted) token: base64url(json).mac. `exp` in ms is enforced. */
  function sign(obj) {
    const body = b64u(JSON.stringify(obj));
    return body + '.' + mac(body);
  }
  function unsign(token) {
    if (typeof token !== 'string') return null;
    const i = token.lastIndexOf('.');
    if (i < 1) return null;
    const body = token.slice(0, i);
    if (!safeEqual(token.slice(i + 1), mac(body))) return null;
    try {
      const obj = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
      if (obj.exp && Date.now() > obj.exp) return null;
      return obj;
    } catch (e) { return null; }
  }

  /* AES-256-GCM for OAuth tokens at rest. */
  function encrypt(plain) {
    if (plain == null) return null;
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

/* HighLevel custom-page SSO payload: CryptoJS.AES.encrypt(JSON, sharedSecret)
   (OpenSSL "Salted__" format, EVP_BytesToKey with MD5, AES-256-CBC). */
function decryptGhlSso(payload, key) {
  try {
    const raw = Buffer.from(String(payload || ''), 'base64');
    if (!key || raw.length < 32 || raw.subarray(0, 8).toString('latin1') !== 'Salted__') return null;
    const salt = raw.subarray(8, 16);
    let d = Buffer.alloc(0), prev = Buffer.alloc(0);
    while (d.length < 48) {
      prev = crypto.createHash('md5').update(Buffer.concat([prev, Buffer.from(key, 'utf8'), salt])).digest();
      d = Buffer.concat([d, prev]);
    }
    const dec = crypto.createDecipheriv('aes-256-cbc', d.subarray(0, 32), d.subarray(32, 48));
    const obj = JSON.parse(Buffer.concat([dec.update(raw.subarray(16)), dec.final()]).toString('utf8'));
    return obj && typeof obj === 'object' ? obj : null;
  } catch (e) { return null; }
}

module.exports = { createCrypto, decryptGhlSso, safeEqual };
