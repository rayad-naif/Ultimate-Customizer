'use strict';
/* Registry of meeting platforms + per-location token handling (encrypted at rest,
   refreshed on demand, refresh-token rotation saved back). */
const { createZoom } = require('./zoom');
const { createTeams } = require('./teams');
const { createMeet } = require('./meet');

class ConnectionError extends Error {
  constructor(message) { super(message); this.name = 'ConnectionError'; }
}

function createProviders({ cfg, http, store, crypto }) {
  const all = { zoom: createZoom({ cfg, http }), teams: createTeams({ cfg, http }), meet: createMeet({ cfg, http }) };

  function tokenFields(t, old) {
    return {
      access: crypto.encrypt(t.access_token),
      refresh: t.refresh_token ? crypto.encrypt(t.refresh_token) : (old && old.refresh) || null,
      expiresAt: new Date(Date.now() + (Number(t.expires_in) || 3600) * 1000)
    };
  }

  async function connect(locationId, name, code) {
    const p = all[name];
    const { token, account } = await p.exchange(code);
    const loc = await store.getLocation(locationId);
    if (!loc) throw new ConnectionError('This sub-account has not installed the app');
    loc.connections = loc.connections || {};
    loc.connections[name] = Object.assign(tokenFields(token), { account, connectedAt: new Date(), broken: null });
    await store.saveLocation(loc);
    return account;
  }

  async function disconnect(locationId, name) {
    const loc = await store.getLocation(locationId);
    if (!loc || !loc.connections || !loc.connections[name]) return;
    const c = loc.connections[name];
    if (all[name].revoke) { try { await all[name].revoke(crypto.decrypt(c.access)); } catch (e) { /* best effort */ } }
    delete loc.connections[name];
    await store.saveLocation(loc);
  }

  /* Returns { token(), account } for a connected platform, or null. */
  async function context(locationId, name) {
    const loc = await store.getLocation(locationId);
    const c = loc && loc.connections && loc.connections[name];
    if (!c) return null;
    let cached = null;
    return {
      account: c.account || {},
      async token() {
        if (cached) return cached;
        const cur = (await store.getLocation(locationId)).connections[name];
        if (new Date(cur.expiresAt).getTime() - 120000 > Date.now()) return (cached = crypto.decrypt(cur.access));
        const rt = crypto.decrypt(cur.refresh);
        if (!rt) throw new ConnectionError(all[name].label + ' connection has expired; reconnect it in the app settings');
        let t;
        try { t = await all[name].refresh(rt); } catch (e) {
          const again = (await store.getLocation(locationId)).connections[name];
          if (again && new Date(again.expiresAt).getTime() - 120000 > Date.now()) return (cached = crypto.decrypt(again.access));
          if (e.status === 400 || e.status === 401) {
            const l = await store.getLocation(locationId);
            l.connections[name].broken = 'Refresh failed (' + e.status + '); reconnect ' + all[name].label;
            await store.saveLocation(l);
            throw new ConnectionError(l.connections[name].broken);
          }
          throw e;
        }
        const l = await store.getLocation(locationId);
        l.connections[name] = Object.assign(l.connections[name], tokenFields(t, l.connections[name]), { broken: null });
        await store.saveLocation(l);
        return (cached = t.access_token);
      }
    };
  }

  return { get: (n) => all[n], list: () => Object.values(all), connect, disconnect, context };
}

module.exports = { createProviders, ConnectionError };
