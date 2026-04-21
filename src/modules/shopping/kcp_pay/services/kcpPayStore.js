const crypto = require('crypto');

class KcpPayStore {
  constructor() {
    this.ttlMs = 15 * 60 * 1000;
    this.store = new Map();
  }

  createPending(payload) {
    const now = Date.now();
    const token = crypto.randomBytes(16).toString('hex');
    const row = {
      token,
      status: 'pending',
      success: false,
      message: '결제 진행 중입니다.',
      request: payload || {},
      createdAt: now,
      updatedAt: now,
      expiresAt: now + this.ttlMs,
    };

    this.store.set(token, row);
    this.cleanup();
    return row;
  }

  get(token) {
    if (!token) return null;
    const row = this.store.get(token);
    if (!row) return null;
    if (row.expiresAt < Date.now()) {
      this.store.delete(token);
      return null;
    }
    return row;
  }

  saveResult(token, patch) {
    const current = this.get(token);
    if (!current) return null;

    const next = {
      ...current,
      ...patch,
      updatedAt: Date.now(),
    };
    this.store.set(token, next);
    return next;
  }

  cleanup() {
    const now = Date.now();
    for (const [key, value] of this.store.entries()) {
      if (!value || value.expiresAt < now) {
        this.store.delete(key);
      }
    }
  }
}

module.exports = new KcpPayStore();
