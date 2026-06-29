const crypto = require('crypto');

/**
 * PHP hash('adler32', md5($identifier)) 와 동일한 8자리 hex
 */
function phpAdler32Hex(input) {
  const buf = Buffer.from(String(input), 'utf8');
  let a = 1;
  let b = 0;
  const MOD = 65521;

  for (let i = 0; i < buf.length; i += 1) {
    a = (a + buf[i]) % MOD;
    b = (b + a) % MOD;
  }

  return (((b << 16) | a) >>> 0).toString(16).padStart(8, '0');
}

/**
 * PHP get_social_convert_id() — 그누보드 소셜 mb_id 규칙
 */
function getSocialConvertId(identifier, provider) {
  const service = String(provider || '').trim().toLowerCase();
  const md5hex = crypto.createHash('md5').update(String(identifier)).digest('hex');
  return `${service}_${phpAdler32Hex(md5hex)}`;
}

function normalizeProvider(provider) {
  const p = String(provider || '').trim().toLowerCase();
  if (p === 'kakao' || p === 'naver') {
    return p;
  }
  return '';
}

function sanitizeSocialNick(value) {
  return String(value || '')
    .replace(/[ #&+\-%@=\/\\:;,\.'"\^`~_|!?\*$#<>()[\]{}]/gi, '')
    .trim();
}

module.exports = {
  getSocialConvertId,
  normalizeProvider,
  sanitizeSocialNick,
  phpAdler32Hex,
};
