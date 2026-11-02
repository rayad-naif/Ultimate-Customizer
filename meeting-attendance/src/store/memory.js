'use strict';
/* In-memory store for local development and tests. Same interface as mongo.js. */
const copy = (o) => (o == null ? null : structuredClone(o));

function createMemoryStore() {
  const locations = new Map(), companies = new Map(), jobs = new Map(), seenIds = new Map();
  const logs = [];
  return {
    kind: 'memory',
    async getLocation(id) { return copy(locations.get(id)); },
    async saveLocation(doc) { doc.updatedAt = new Date(); locations.set(doc._id, copy(doc)); return doc; },
    async deleteLocation(id) { locations.delete(id); },
    async getCompany(id) { return copy(companies.get(id)); },
    async saveCompany(doc) { doc.updatedAt = new Date(); companies.set(doc._id, copy(doc)); return doc; },
    async deleteCompany(id) { companies.delete(id); },

    async scheduleEvent(j) {
      const cur = jobs.get(j.key);
      if (cur) {
        if (!cur.eventIds.includes(j.eventId)) cur.eventIds.push(j.eventId);
      } else {
        jobs.set(j.key, {
          _id: j.key, locationId: j.locationId, calendarId: j.calendarId, startTime: j.startTime,
          endTime: j.endTime, address: j.address, eventIds: [j.eventId], stage: 'attendance',
          attempts: 0, dueAt: j.dueAt, leaseUntil: new Date(0)
        });
      }
    },
    async unscheduleEvent(locationId, eventId, exceptKey) {
      for (const [k, job] of jobs) {
        if (job.locationId !== locationId || k === exceptKey || job.stage !== 'attendance') continue;
        job.eventIds = job.eventIds.filter((e) => e !== eventId);
        if (!job.eventIds.length) jobs.delete(k);
      }
    },
    async claimDue(now, limit, leaseMs) {
      const out = [];
      for (const job of [...jobs.values()].sort((a, b) => a.dueAt - b.dueAt)) {
        if (out.length >= limit) break;
        if (job.dueAt <= now && job.leaseUntil <= now) {
          job.leaseUntil = new Date(now.getTime() + leaseMs);
          out.push(copy(job));
        }
      }
      return out;
    },
    async getJob(key) { return copy(jobs.get(key)); },
    async saveJob(job) { jobs.set(job._id, copy(job)); },
    async deleteJob(key) { jobs.delete(key); },
    async deleteJobsForLocation(locationId) {
      for (const [k, j] of jobs) if (j.locationId === locationId) jobs.delete(k);
    },
    async allJobs() { return [...jobs.values()].map(copy); },

    async seen(id) {
      const now = Date.now();
      for (const [k, t] of seenIds) if (t < now - 48 * 3600e3) seenIds.delete(k);
      if (seenIds.has(id)) return true;
      seenIds.set(id, now);
      return false;
    },
    async log(locationId, code, detail) {
      logs.unshift({ at: new Date(), locationId: locationId || null, code, detail: String(detail || '').slice(0, 300) });
      if (logs.length > 2000) logs.length = 2000;
    },
    async recentLogs(locationId, n) { return logs.filter((l) => !locationId || l.locationId === locationId).slice(0, n || 50).map(copy); },
    async ping() { return 'memory'; },
    async close() {}
  };
}

module.exports = { createMemoryStore };
