const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const APPLE_JWKS_URL = 'https://appleid.apple.com/auth/keys';
const APPLE_ISS = 'https://appleid.apple.com';

class AppleIdentityService {
  constructor() {
    this.keys = null;
    this.keysFetchedAt = 0;
    this.keysTtlMs = 60 * 60 * 1000;
  }

  getAudiences() {
    const bundleId = String(process.env.APPLE_BUNDLE_ID || 'com.bomiora.app').trim();
    const serviceId = String(process.env.APPLE_SERVICE_ID || 'com.bomiora.app.signin').trim();
    return [...new Set([bundleId, serviceId].filter(Boolean))];
  }

  async getAppleKeys(force = false) {
    const now = Date.now();
    if (!force && this.keys && now - this.keysFetchedAt < this.keysTtlMs) {
      return this.keys;
    }
    const response = await fetch(APPLE_JWKS_URL);
    if (!response.ok) {
      throw new Error('Apple 공개키를 가져오지 못했습니다.');
    }
    const data = await response.json();
    this.keys = Array.isArray(data.keys) ? data.keys : [];
    this.keysFetchedAt = now;
    return this.keys;
  }

  findKey(keys, kid) {
    return keys.find((key) => key.kid === kid) || null;
  }

  async verifyIdentityToken(identityToken) {
    const token = String(identityToken || '').trim();
    if (!token) {
      return { ok: false, message: 'Apple identityToken이 필요합니다.' };
    }

    const header = jwt.decode(token, { complete: true });
    if (!header?.header?.kid) {
      return { ok: false, message: 'Apple 토큰 형식이 올바르지 않습니다.' };
    }

    let keys = await this.getAppleKeys();
    let jwk = this.findKey(keys, header.header.kid);
    if (!jwk) {
      keys = await this.getAppleKeys(true);
      jwk = this.findKey(keys, header.header.kid);
    }
    if (!jwk) {
      return { ok: false, message: 'Apple 토큰 서명 키를 찾을 수 없습니다.' };
    }

    let publicKey;
    try {
      publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
    } catch (error) {
      return { ok: false, message: 'Apple 공개키 변환에 실패했습니다.' };
    }

    try {
      const payload = jwt.verify(token, publicKey, {
        algorithms: ['RS256'],
        issuer: APPLE_ISS,
        audience: this.getAudiences(),
      });
      const sub = String(payload.sub || '').trim();
      if (!sub) {
        return { ok: false, message: 'Apple 사용자 식별값이 없습니다.' };
      }
      return {
        ok: true,
        sub,
        email: String(payload.email || '').trim(),
        emailVerified: payload.email_verified === true || payload.email_verified === 'true',
      };
    } catch (error) {
      return {
        ok: false,
        message: error?.message
          ? `Apple 토큰 검증에 실패했습니다. (${error.message})`
          : 'Apple 토큰 검증에 실패했습니다.',
      };
    }
  }

  async verifyFromRequest(req) {
    const token = String(
      req.body?.identityToken ||
        req.body?.identity_token ||
        req.body?.id_token ||
        req.body?.accessToken ||
        ''
    ).trim();
    return this.verifyIdentityToken(token);
  }
}

module.exports = new AppleIdentityService();
