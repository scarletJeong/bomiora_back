const { TtlCache } = require('../../../utils/ttlCache');

/** 환불계좌는 자주 안 바뀌므로 10분 캐시. GET을 메모리 히트로 맞춤 */
const TTL_MS = 10 * 60 * 1000;
const store = new TtlCache(TTL_MS);

function cacheKey(mbId) {
  return `refund:${String(mbId || '').trim()}`;
}

function toStr(value) {
  if (value == null) return '';
  if (Buffer.isBuffer(value)) return value.toString('utf8').trim();
  if (value && value.type === 'Buffer' && Array.isArray(value.data)) {
    return Buffer.from(value.data).toString('utf8').trim();
  }
  return String(value).trim();
}

function payloadFromRow(row) {
  if (!row) return null;
  return {
    success: true,
    refundBank: toStr(row.mb_refund_bank ?? row.refundBank),
    refundAccount: toStr(row.mb_refund_account ?? row.refundAccount),
    refundHolder: toStr(row.mb_refund_holder ?? row.refundHolder),
  };
}

function getCachedPayload(mbId) {
  return store.get(cacheKey(mbId));
}

function setCachedPayload(mbId, payload) {
  if (!mbId || !payload) return payload;
  return store.set(cacheKey(mbId), payload, TTL_MS);
}

function rememberFromMemberRow(mbId, row) {
  const id = String(mbId || '').trim();
  if (!id || !row) return;
  if (
    row.mb_refund_bank == null &&
    row.mb_refund_account == null &&
    row.mb_refund_holder == null &&
    row.refundBank == null
  ) {
    return;
  }
  setCachedPayload(id, payloadFromRow(row));
}

function rememberPayload(mbId, { bank, account, holder }) {
  return setCachedPayload(mbId, {
    success: true,
    refundBank: toStr(bank),
    refundAccount: toStr(account),
    refundHolder: toStr(holder),
  });
}

function remove(mbId) {
  store.remove(cacheKey(mbId));
}

module.exports = {
  getCachedPayload,
  setCachedPayload,
  rememberFromMemberRow,
  rememberPayload,
  payloadFromRow,
  remove,
};
