require('dotenv').config();
const http = require('http');
const pool = require('../src/config/database');

async function main() {
  console.log('INTERNAL_NOTIFY_SECRET set:', Boolean((process.env.INTERNAL_NOTIFY_SECRET || '').trim()));

  const [tokens] = await pool.query(
    'SELECT mb_id, platform, LEFT(fcm_token, 40) AS token_prefix, updated_at FROM bomiora_member_fcm_token ORDER BY updated_at DESC LIMIT 5'
  );
  console.log('\n=== FCM tokens (latest 5) ===');
  console.log(tokens);

  if (tokens.length) {
    const mbId = tokens[0].mb_id;
    const [settings] = await pool.query(
      'SELECT mb_id, mb_notif_app_push, mb_notif_order FROM bomiora_member WHERE mb_id = ? LIMIT 1',
      [mbId]
    );
    console.log('\n=== Push settings for', mbId, '===');
    console.log(settings[0] || 'not found');

    await testNotify(mbId);
  } else {
    console.log('\nNo FCM tokens in DB — app may be pointing to bomiora.net or user not logged in on device.');
    await testNotify('test');
  }

  const [inq] = await pool.query(
    `SELECT wr_id, mb_id, wr_subject,
            LENGTH(TRIM(IFNULL(wr_7, ''))) AS answer_len,
            wr_is_comment
     FROM bomiora_write_online
     WHERE wr_parent = wr_id
     ORDER BY wr_id DESC
     LIMIT 3`
  );
  console.log('\n=== Recent root inquiries ===');
  console.log(inq);

  process.exit(0);
}

function testNotify(mbId) {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      type: 'contact',
      mb_id: mbId,
      wr_id: 1,
      subject: '디버그테스트',
    });
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: 9000,
        path: '/api/internal/notify',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'X-Internal-Secret': process.env.INTERNAL_NOTIFY_SECRET || '',
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          console.log('\n=== POST /api/internal/notify ===');
          console.log('HTTP', res.statusCode);
          console.log(data);
          resolve();
        });
      }
    );
    req.on('error', (e) => {
      console.error('notify request error:', e.message);
      resolve();
    });
    req.write(body);
    req.end();
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
