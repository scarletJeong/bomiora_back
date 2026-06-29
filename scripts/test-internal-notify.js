require('dotenv').config();
const http = require('http');

const body = JSON.stringify({
  type: 'contact',
  mb_id: process.argv[2] || 'test',
  wr_id: 1,
  subject: '테스트문의',
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
      console.log('HTTP', res.statusCode);
      console.log(data);
    });
  }
);
req.on('error', (e) => console.error(e));
req.write(body);
req.end();
