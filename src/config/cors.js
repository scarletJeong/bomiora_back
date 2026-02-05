const cors = require('cors');

const corsOptions = {
  origin: function (origin, callback) {
    // 허용할 origin 목록
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:8080',
      'https://bomiora.kr'
    ];
    
    // origin이 없거나 허용 목록에 있으면 허용
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('CORS 정책에 의해 차단되었습니다.'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

module.exports = cors(corsOptions);
