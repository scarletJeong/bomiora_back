/** 검색 비교용 제목. HTML 태그와 상품명 `(@아이디)`는 글자로 치지 않는다. */
function visibleTitleSql(columnSql) {
  const stripped = `REGEXP_REPLACE(CAST(${columnSql} AS CHAR), '<[^>]*>', ' ')`;
  const withoutHandle = `REGEXP_REPLACE(${stripped}, '\\\\(@[^)]*\\\\)', ' ')`;
  return `TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(${withoutHandle}, '&nbsp;', ' '), '&amp;', '&'), '&lt;', '<'), '&gt;', '>'), '&quot;', '"'), '&#39;', ''''))`;
}

module.exports = { visibleTitleSql };
