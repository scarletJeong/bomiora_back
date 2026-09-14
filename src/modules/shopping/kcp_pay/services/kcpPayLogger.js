const fs = require('fs');
const path = require('path');

const REDACT_KEY = /enc[_-]?data|enc[_-]?info|card[_-]?(no|num|number)|acct|account|cvv|cvc|passwd|password|site[_-]?key|refund[_-]?account/i;

function resolveLogDir() {
  const fromEnv = String(process.env.KCP_PAY_LOG_DIR || '').trim();
  if (fromEnv) return path.resolve(fromEnv);
  return path.resolve(process.cwd(), 'logs', 'kcp-pay');
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function nowKstParts(date = new Date()) {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = pad(kst.getUTCMonth() + 1);
  const d = pad(kst.getUTCDate());
  const hh = pad(kst.getUTCHours());
  const mm = pad(kst.getUTCMinutes());
  const ss = pad(kst.getUTCSeconds());
  return {
    date: `${y}-${m}-${d}`,
    time: `${hh}:${mm}:${ss}`,
    stamp: `${y}-${m}-${d} ${hh}:${mm}:${ss}`,
    iso: `${y}-${m}-${d}T${hh}:${mm}:${ss}+09:00`,
  };
}

function sanitizeValue(value, depth = 0) {
  if (value == null) return value;
  if (depth > 4) return '[…]';
  if (typeof value === 'string') {
    if (value.length > 800) return `${value.slice(0, 800)}…`;
    return value;
  }
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeValue(item, depth + 1));
  }
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (REDACT_KEY.test(key)) {
      out[key] = '[REDACTED]';
      continue;
    }
    out[key] = sanitizeValue(item, depth + 1);
  }
  return out;
}

function formatWho(who) {
  if (!who) return '알 수 없음';
  if (typeof who === 'string') return who.trim() || '알 수 없음';
  const mbId = String(who.mbId || who.mb_id || '').trim();
  const name = String(who.name || who.mbName || '').trim();
  if (mbId && name) return `${mbId} (${name})`;
  return mbId || name || '알 수 없음';
}

function formatWhat(what) {
  const row = what || {};
  const parts = [];
  const odId = String(row.odId || row.orderId || row.od_id || '').trim();
  const tno = String(row.tno || '').trim();
  const amount = row.amount ?? row.od_receipt_price;
  const settleCase = String(row.settleCase || row.od_settle_case || '').trim();
  const status = String(row.status || row.od_status || '').trim();
  const token = String(row.token || '').trim();
  if (odId) parts.push(`주문번호=${odId}`);
  if (tno) parts.push(`거래번호(tno)=${tno}`);
  if (amount != null && amount !== '') parts.push(`금액=${amount}원`);
  if (settleCase) parts.push(`결제수단=${settleCase}`);
  if (status) parts.push(`주문상태=${status}`);
  if (token) parts.push(`세션토큰=${token}`);
  return parts.length ? parts.join(', ') : '대상 정보 없음';
}

function formatHow(how) {
  if (!how) return '알 수 없음';
  if (typeof how === 'string') return how.trim() || '알 수 없음';
  const action = String(how.action || '').trim();
  const extras = [];
  if (how.modType) extras.push(`modType=${how.modType}`);
  if (how.modDesc) extras.push(`modDesc=${how.modDesc}`);
  if (how.ip) extras.push(`IP=${how.ip}`);
  if (how.payMethod) extras.push(`payMethod=${how.payMethod}`);
  const extraText = extras.length ? ` (${extras.join(', ')})` : '';
  return `${action || '알 수 없음'}${extraText}`;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * KCP 결제/취소 문제 전용 파일 로그.
 * 경로: logs/kcp-pay/kcp-pay-YYYY-MM-DD.log (KCP_PAY_LOG_DIR 로 변경 가능)
 *
 * @param {object} entry
 * @param {'error'|'warn'} [entry.level]
 * @param {string} entry.action  결제 | 결제취소 | 자동취소 | 입금통보 | 결제요청
 * @param {string|object} entry.who  mbId 또는 { mbId, name }
 * @param {object} entry.what  { odId, tno, amount, settleCase, status, token }
 * @param {string|object} entry.how  설명 또는 { action, modType, ip, ... }
 * @param {string} entry.why
 * @param {object} [entry.detail]
 */
function logKcpPayProblem(entry) {
  const when = nowKstParts();
  const level = String(entry?.level || 'error').toLowerCase() === 'warn' ? 'WARN' : 'ERROR';
  const action = String(entry?.action || '결제').trim() || '결제';
  const who = formatWho(entry?.who);
  const what = formatWhat(entry?.what);
  const how = formatHow(entry?.how);
  const why = String(entry?.why || '원인 미상').trim() || '원인 미상';
  const detail = sanitizeValue(entry?.detail || {});

  const lines = [
    '============================================================',
    `[${when.stamp} KST] ${level}  ${action}`,
    `언제: ${when.stamp} (KST)`,
    `누가: ${who}`,
    `무엇을: ${what}`,
    `어떻게: ${how}`,
    `왜: ${why}`,
    `상세: ${JSON.stringify(detail)}`,
    '============================================================',
    '',
  ];
  const text = lines.join('\n');

  try {
    const dir = resolveLogDir();
    ensureDir(dir);
    const filePath = path.join(dir, `kcp-pay-${when.date}.log`);
    fs.appendFile(filePath, text, (err) => {
      if (err) {
        console.error('[kcpPayLogger] 파일 기록 실패:', err.message);
        console.error(text);
      }
    });
  } catch (err) {
    console.error('[kcpPayLogger] 파일 기록 실패:', err.message);
    console.error(text);
  }

  if (level === 'ERROR') {
    console.error(`[KCP-PAY-LOG] ${when.stamp} | ${action} | 누가=${who} | ${what} | 왜=${why}`);
  } else {
    console.warn(`[KCP-PAY-LOG] ${when.stamp} | ${action} | 누가=${who} | ${what} | 왜=${why}`);
  }
}

module.exports = {
  logKcpPayProblem,
  resolveLogDir,
};
