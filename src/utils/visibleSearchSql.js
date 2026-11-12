/** 검색 비교용 제목. HTML 태그와 상품명 `(@아이디)`는 글자로 치지 않는다. */
function visibleTitleSql(columnSql) {
  const stripped = `REGEXP_REPLACE(CAST(${columnSql} AS CHAR), '<[^>]*>', ' ')`;
  const withoutHandle = `REGEXP_REPLACE(${stripped}, '\\\\(@[^)]*\\\\)', ' ')`;
  return `TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(${withoutHandle}, '&nbsp;', ' '), '&amp;', '&'), '&lt;', '<'), '&gt;', '>'), '&quot;', '"'), '&#39;', ''''))`;
}

/**
 * 사용자 검색어를 LIKE 포함 패턴으로 만든다.
 * `%` `_` `!` 는 와일드카드가 아니라 그 글자로 찾는다. `ESCAPE '!'` 와 같이 쓴다.
 */
function likeContainsPattern(raw) {
  const text = String(raw ?? '')
    .trim()
    .replace(/!/g, '!!')
    .replace(/%/g, '!%')
    .replace(/_/g, '!_');
  return `%${text}%`;
}

const likeEscapeSql = "ESCAPE '!'";

module.exports = { visibleTitleSql, likeContainsPattern, likeEscapeSql };
