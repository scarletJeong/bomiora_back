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

/**
 * MySQL DATE / 예약일 등 **달력 날짜** → `YYYY-MM-DD`.
 * mysql2 `timezone: +09:00` 이면 DATE `YYYY-MM-DD` 가 KST 00:00 instant(UTC 전날 15:00)가 되고,
 * Node TZ가 UTC일 때 `getDate()` 는 하루 빨라진다. 목록 `DATE_FORMAT` 과 맞추려면 KST 달력을 쓴다.
 */
function pad2(n) {
  return String(n).padStart(2, '0');
}

function kstWallClockParts(date) {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return {
    y: kst.getUTCFullYear(),
    m: kst.getUTCMonth() + 1,
    d: kst.getUTCDate(),
    h: kst.getUTCHours(),
    mi: kst.getUTCMinutes(),
    s: kst.getUTCSeconds()
  };
}

/** 현재(또는 주어진) instant → KST `YYYY-MM-DD HH:mm:ss` (Node TZ와 무관) */
function formatKstStamp(value = new Date()) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const p = kstWallClockParts(d);
  return `${p.y}-${pad2(p.m)}-${pad2(p.d)} ${pad2(p.h)}:${pad2(p.mi)}:${pad2(p.s)}`;
}

function formatSqlDateOnlyForApi(value) {
  if (value == null || value === '') return null;

  if (typeof value === 'string') {
    const s = value.trim();
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    if (/^\d{4}-\d{2}-\d{2} /.test(s) && !s.includes('T')) return s.slice(0, 10);
  }

  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;

  const p = kstWallClockParts(d);
  return `${p.y}-${pad2(p.m)}-${pad2(p.d)}`;
}

/**
 * 주문 od_time 등 MySQL DATETIME → 화면용 KST 벽시계.
 * Node TZ가 UTC여도 mysql2 `+09:00` Date 의 getHours()가 9시간 밀리지 않게 한다.
 * - 타임존 없는 문자열: 적힌 시·분을 그대로 사용
 * - Date / ISO(Z): instant → KST
 */
function formatSqlDateTimeForApi(value, withTime = true) {
  if (value == null || value === '') return '';

  if (typeof value === 'string') {
    const s = value.trim();
    if (!s) return '';
    const normalized = s.includes('T') ? s : s.replace(' ', 'T');
    if (!hasExplicitZone(normalized)) {
      const m = s.match(
        /^(\d{4})[-.](\d{1,2})[-.](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/
      );
      if (m) {
        const y = m[1];
        const mo = pad2(m[2]);
        const d = pad2(m[3]);
        if (!withTime) return `${y}.${mo}.${d}`;
        return `${y}.${mo}.${d} ${pad2(m[4] || '0')}:${pad2(m[5] || '0')}:${pad2(m[6] || '0')}`;
      }
    }
  }

  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const p = kstWallClockParts(d);
  const date = `${p.y}.${pad2(p.m)}.${pad2(p.d)}`;
  if (!withTime) return date;
  return `${date} ${pad2(p.h)}:${pad2(p.mi)}:${pad2(p.s)}`;
}

/** 한국 달력 하루(00:00~23:59:59.999 KST)에 해당하는 UTC 구간 — measured_at 범위 조회 등 */
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
  addDaysToYmdDateString,
  formatSqlDateOnlyForApi,
  formatSqlDateTimeForApi,
  formatKstStamp
};
