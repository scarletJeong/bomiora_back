/**
 * 건강 API용 날짜/시간: JSON에는 항상 실제 instant 기준 UTC ISO-8601(Z)로 통일.
 *
 * MySQL DATETIME(타임존 미저장)은 기본적으로 **한국 벽시계(KST)** 로 넣고 읽는다고 가정한다.
 * `src/config/database.js` 의 mysql2 `timezone` 은 `+09:00`(또는 DB_TIMEZONE) — 이때 읽힌 JS Date 의
 * toISOString() 이 올바른 instant가 되고, 앱에서 toLocal() 해도 DB에 찍힌 시·분과 일치한다.
 *
 * API 타임존 없는 문자열 입력: "yyyy-MM-dd HH:mm:ss" / "yyyy-MM-ddTHH:mm:ss" 는 +09:00 으로 해석.
 */

const NAIVE_LOCAL = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?(?:\.\d{1,6})?$/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const TIME_ONLY = /^\d{2}:\d{2}(:\d{2})?$/;

function hasExplicitZone(s) {
  return /Z$/i.test(s) || /[+-]\d{2}:\d{2}$/.test(s) || /[+-]\d{4}$/.test(s);
}

/**
 * 클라이언트/쿼리에서 온 값을 Date(instant)로 정규화. 저장 전에 사용.
 * @param {string|number|Date} value
 * @returns {Date}
 */
function parseHealthDateTimeInput(value) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new Error('유효하지 않은 날짜입니다.');
    }
    return value;
  }
  if (value == null || value === '') {
    throw new Error('날짜 값이 비어 있습니다.');
  }
  if (typeof value === 'number') {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
      throw new Error('유효하지 않은 날짜입니다.');
    }
    return d;
  }

  const raw = String(value).trim();
  if (!raw) {
    throw new Error('날짜 값이 비어 있습니다.');
  }

  if (DATE_ONLY.test(raw)) {
    const d = new Date(`${raw}T00:00:00+09:00`);
    if (Number.isNaN(d.getTime())) {
      throw new Error(`유효하지 않은 날짜 형식입니다: ${value}`);
    }
    return d;
  }

  const normalized = raw.replace(' ', 'T');

  if (hasExplicitZone(normalized)) {
    const d = new Date(normalized);
    if (Number.isNaN(d.getTime())) {
      throw new Error(`유효하지 않은 날짜 형식입니다: ${value}`);
    }
    return d;
  }

  if (NAIVE_LOCAL.test(raw)) {
    const d = new Date(`${normalized}+09:00`);
    if (Number.isNaN(d.getTime())) {
      throw new Error(`유효하지 않은 날짜 형식입니다: ${value}`);
    }
    return d;
  }

  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`유효하지 않은 날짜 형식입니다: ${value}`);
  }
  return d;
}

/**
 * 선택 필드용. null/빈 문자열이면 null, 없으면 defaultDate 또는 null.
 */
function parseHealthDateTimeOptional(value, defaultDate = null) {
  if (value == null || value === '') {
    return defaultDate;
  }
  return parseHealthDateTimeInput(value);
}

/**
 * JSON 응답용: UTC ISO-8601 (…Z). 날짜만(기록용)이면 yyyy-MM-dd 유지. TIME만이면 그대로.
 * @param {string|number|Date|null|undefined} value
 * @returns {string|null}
 */
function toIsoUtcString(value) {
  if (value == null || value === '') {
    return null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }

  const s = String(value).trim();
  if (!s) {
    return null;
  }

  if (TIME_ONLY.test(s)) {
    return s;
  }

  if (DATE_ONLY.test(s)) {
    return s;
  }

  const tryParse = (str) => {
    const d = new Date(str);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  };

  const withT = s.includes('T') ? s : s.replace(' ', 'T');

  // "yyyy-MM-dd HH:mm:ss" 처럼 오프셋 없는 값은 KST 벽시계 (parseHealthDateTimeInput 과 동일)
  if (NAIVE_LOCAL.test(s) && !hasExplicitZone(withT)) {
    try {
      const d = parseHealthDateTimeInput(s);
      return Number.isNaN(d.getTime()) ? null : d.toISOString();
    } catch {
      /* fall through */
    }
  }

  if (hasExplicitZone(withT)) {
    const iso = tryParse(withT);
    if (iso) {
      return iso;
    }
  }

  const fallback = tryParse(withT);
  return fallback ?? s;
}

/** 한국 달력 하루(00:00~23:59:59.999 KST)에 해당하는 UTC 구간 — measured_at 범위 조회 등 */
/** YYYY-MM-DD 달력(그레고리력) 기준으로 일 수 더하기 — 서버 로컬 TZ와 무관 */
function addDaysToYmdDateString(ymd, deltaDays) {
  const raw = String(ymd).trim();
  const parts = raw.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) {
    throw new Error(`날짜는 YYYY-MM-DD 형식이어야 합니다: ${ymd}`);
  }
  const [y, m, d] = parts;
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return dt.toISOString().slice(0, 10);
}

function utcRangeForKstCalendarDay(dateStr) {
  const raw = String(dateStr).trim();
  if (!DATE_ONLY.test(raw)) {
    throw new Error(`날짜는 YYYY-MM-DD 형식이어야 합니다: ${dateStr}`);
  }
  return {
    start: parseHealthDateTimeInput(`${raw}T00:00:00+09:00`),
    end: parseHealthDateTimeInput(`${raw}T23:59:59.999+09:00`)
  };
}

module.exports = {
  parseHealthDateTimeInput,
  parseHealthDateTimeOptional,
  toIsoUtcString,
  utcRangeForKstCalendarDay,
  addDaysToYmdDateString
};
