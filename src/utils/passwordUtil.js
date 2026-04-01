const crypto = require('crypto');

/**
 * 비밀번호 암호화 유틸리티
 * - PBKDF2 (PHP password_hash 호환)
 * - MySQL PASSWORD() 함수 호환
 */

/**
 * PBKDF2 방식으로 저장된 비밀번호 검증 (PHP password_hash 호환)
 * 
 * DB 저장 형식: sha256:12000:salt_base64:hash_base64
 * PHP: hash_pbkdf2('sha256', $password, $salt, 12000, 24, true)
 * 
 * @param {string} plainPassword - 평문 비밀번호 (Flutter에서 SHA1 해시된 값)
 * @param {string} storedHash - DB에 저장된 해시 (sha256:12000:salt:hash 형식)
 * @returns {boolean} - 비밀번호 일치 여부
 */
function verifyPBKDF2Password(plainPassword, storedHash) {
  try {
    // 1. 저장된 해시 파싱
    const parts = storedHash.split(':');
    if (parts.length !== 4) {
      console.log('❌ [PBKDF2] 잘못된 해시 형식:', storedHash);
      return false;
    }
    
    const algorithm = parts[0]; // "sha256"
    const iterations = parseInt(parts[1]); // "12000"
    const saltBase64 = parts[2]; // Base64 인코딩된 Salt
    const hashBase64 = parts[3]; // Base64 인코딩된 Hash
    
    console.log('📋 [PBKDF2] 알고리즘:', algorithm);
    console.log('📋 [PBKDF2] 반복 횟수:', iterations);
    console.log('📋 [PBKDF2] Salt (Base64 문자열):', saltBase64);
    console.log('📋 [PBKDF2] 저장된 Hash (Base64):', hashBase64);
    
    // 2. Salt는 Base64 문자열 그대로 사용 (PHP와 동일)
    // PHP의 hash_pbkdf2()는 Salt를 문자열로 받음 (디코딩 안 함)
    const salt = Buffer.from(saltBase64, 'utf8');
    console.log('📋 [PBKDF2] Salt 길이:', salt.length, 'bytes');
    
    // 3. 저장된 해시 디코딩하여 길이 확인
    const storedHashBytes = Buffer.from(hashBase64, 'base64');
    const keyLength = storedHashBytes.length; // PHP에서 생성된 해시의 실제 길이
    console.log('📋 [PBKDF2] Hash 길이:', keyLength, 'bytes');
    
    // 4. 평문 비밀번호를 PBKDF2로 해싱
    // Node.js crypto.pbkdf2Sync(algorithm, password, salt, iterations, keylen)
    const hash = crypto.pbkdf2Sync(
      plainPassword,
      salt,
      iterations,
      keyLength,
      'sha256'
    );
    
    // 5. Base64 인코딩
    const computedHashBase64 = hash.toString('base64');
    console.log('🔐 [PBKDF2] 계산된 Hash (Base64):', computedHashBase64);
    console.log('🔐 [PBKDF2] 계산된 Hash 길이:', hash.length, 'bytes');
    
    // 6. 비교
    const match = hashBase64 === computedHashBase64;
    console.log('✅ [PBKDF2] 일치 여부:', match);
    
    return match;
    
  } catch (error) {
    console.log('❌ [PBKDF2] 검증 오류:', error.message);
    console.error(error);
    return false;
  }
}

/**
 * MySQL PASSWORD() 함수와 동일한 방식으로 비밀번호 해싱
 * @param {string} password - 원본 비밀번호 (Flutter에서 SHA1 해시된 값)
 * @returns {string} - MySQL PASSWORD() 함수와 동일한 해시값 (41자, * prefix 포함)
 */
function mysqlPassword(password) {
  try {
    // 1단계: SHA1 해싱
    const firstHash = crypto.createHash('sha1').update(password, 'utf8').digest();
    
    // 2단계: SHA1 해시를 다시 SHA1 해싱 (double hash)
    const secondHash = crypto.createHash('sha1').update(firstHash).digest();
    
    // 3단계: HEX 인코딩 (대문자)
    const hexString = secondHash.toString('hex').toUpperCase();
    
    // 4단계: '*' prefix 추가
    return '*' + hexString;
    
  } catch (error) {
    throw new Error('Password hashing failed: ' + error.message);
  }
}

/**
 * PHP get_encrypt_string 호환 저장 포맷 생성
 * 형식: sha256:12000:salt_base64:hash_base64
 */
function createPBKDF2Password(password) {
  const iterations = 12000;
  const algorithm = 'sha256';
  const keyLength = 24;
  const salt = crypto.randomBytes(24).toString('base64');
  const hash = crypto.pbkdf2Sync(
    String(password ?? ''),
    Buffer.from(salt, 'utf8'),
    iterations,
    keyLength,
    algorithm
  ).toString('base64');

  return `${algorithm}:${iterations}:${salt}:${hash}`;
}

module.exports = {
  verifyPBKDF2Password,
  mysqlPassword,
  createPBKDF2Password
};
