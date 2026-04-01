const crypto = require('crypto');

class KcpResultStore {
  constructor() {
    this.results = new Map();
    this.defaultTtlMs = Number(process.env.KCP_RESULT_TTL_MS || 10 * 60 * 1000);
  }

  createPendingToken(metadata = {}) {
    this.cleanupExpired();

    const token = crypto.randomUUID();
    const now = Date.now();
    const expiresAt = new Date(now + this.defaultTtlMs);

    const entry = {
      token,
      status: 'pending',
      cert_completed: false,
      createdAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
      expiresAt: expiresAt.toISOString(),
      metadata,
    };

    this.results.set(token, entry);
    return entry;
  }

  saveResult(token, payload) {
    this.cleanupExpired();

    const existing = this.results.get(token);
    const nowIso = new Date().toISOString();

    const nextValue = {
      token,
      status: payload.status || existing?.status || 'failed',
      cert_completed: payload.cert_completed === true,
      createdAt: existing?.createdAt || nowIso,
      updatedAt: nowIso,
      expiresAt: existing?.expiresAt || new Date(Date.now() + this.defaultTtlMs).toISOString(),
      metadata: existing?.metadata || {},
      ...payload,
    };

    this.results.set(token, nextValue);
    return nextValue;
  }

  getResult(token) {
    this.cleanupExpired();
    return this.results.get(token) || null;
  }

  cleanupExpired() {
    const now = Date.now();
    for (const [token, entry] of this.results.entries()) {
      if (!entry?.expiresAt) {
        continue;
      }

      if (new Date(entry.expiresAt).getTime() <= now) {
        this.results.delete(token);
      }
    }
  }
}

module.exports = new KcpResultStore();
