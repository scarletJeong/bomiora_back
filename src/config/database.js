const mysql = require('mysql2/promise');
require('dotenv').config();

// MySQL 연결 풀 생성
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  supportBigNumbers: true,
  bigNumberStrings: true,
  // DATETIME(타임존 없음)을 한국 벽시계(KST)로 해석·직렬화.
  // 'Z'로 두면 "2026-04-09 10:24:14" 가 UTC로 읽혀 API·앱에서 +9h 보정되어 19:24로 깨짐.
  // 글로벌/UTC 저장만 쓸 때는 환경변수 DB_TIMEZONE=Z 등으로 바꿀 수 있음.
  timezone: process.env.DB_TIMEZONE || '+09:00'
});

// 연결 테스트
pool.getConnection()
  .then(connection => {
    console.log('✅ Database connected successfully');
    connection.release();
  })
  .catch(err => {
    console.error('❌ Database connection error:', err.message);
  });

module.exports = pool;
