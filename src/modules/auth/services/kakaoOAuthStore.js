const crypto = require('crypto');

class KakaoOAuthStore {
  constructor() {
    this.sessions = new Map();
    this.defaultTtlMs = Number(process.env.KAKAO_OAUTH_TTL_MS || 10 * 60 * 1000);
  }

  createPending({ returnTo = '' } = {}) {
    this.cleanupExpired();

    const token = crypto.randomUUID();
    const now = Date.now();
    const expiresAt = new Date(now + this.defaultTtlMs).toISOString();

    const entry = {
      token,
      status: 'pending',
      returnTo: String(returnTo || '').trim(),
      createdAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
      expiresAt,
    };

    this.sessions.set(token, entry);
    return entry;
  }

  getSession(token) {
    this.cleanupExpired();
    return this.sessions.get(String(token || '').trim()) || null;
  }

  saveResult(token, payload = {}) {
    this.cleanupExpired();

    const key = String(token || '').trim();
    const existing = this.sessions.get(key);
    const nowIso = new Date().toISOString();

    const nextValue = {
      token: key,
      status: payload.status || existing?.status || 'failed',
      returnTo: existing?.returnTo || '',
      createdAt: existing?.createdAt || nowIso,
      updatedAt: nowIso,
      expiresAt: existing?.expiresAt || new Date(Date.now() + this.defaultTtlMs).toISOString(),
      ...payload,
    };

    this.sessions.set(key, nextValue);
    return nextValue;
  }

  consumeResult(token) {
    const entry = this.getSession(token);
    if (!entry) {
      return null;
    }
    this.sessions.delete(String(token || '').trim());
    return entry;
  }

  cleanupExpired() {
    const now = Date.now();
    for (const [token, entry] of this.sessions.entries()) {
      if (!entry?.expiresAt) {
        continue;
      }
      if (new Date(entry.expiresAt).getTime() <= now) {
        this.sessions.delete(token);
      }
    }
  }
}

module.exports = new KakaoOAuthStore();
