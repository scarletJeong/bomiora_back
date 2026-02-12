require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const app = express();
const PORT = process.env.PORT || 9000;

// 미들웨어 설정
app.use(helmet()); // 보안 헤더
app.use(cors()); // CORS 설정
app.use(morgan('dev')); // 로깅
app.use(express.json()); // JSON 파싱
app.use(express.urlencoded({ extended: true })); // URL 인코딩

// 기본 라우트
app.get('/', (req, res) => {
  res.json({ 
    message: 'Bomiora Backend API',
    version: '1.0.0',
    status: 'running'
  });
});

// API 라우트
const userController = require('./src/modules/auth/controllers/UserController');

app.get('/api/test', (req, res) => userController.test(req, res));
app.get('/api/users', (req, res) => userController.getAllUsers(req, res));

// 인증 모듈 라우트
app.use('/api/auth', require('./src/modules/auth/routes/authRoutes'));
app.use('/api/user', require('./src/modules/auth/routes/userRoutes'));
app.use('/api/health/weight', require('./src/modules/health/weight/routes/weightRoutes'));
app.use('/api/health/blood-sugar', require('./src/modules/health/blood_sugar/routes/bloodSugarRoutes'));
app.use('/api/contact', require('./src/modules/user/contact/routes/contactRoutes'));
app.use('/api/user/address', require('./src/modules/user/address/routes/addressRoutes'));
app.use('/api/user', require('./src/modules/user/point/routes/pointRoutes'));
app.use('/api/user', require('./src/modules/user/coupon/routes/couponRoutes'));
app.use('/api/healthprofile', require('./src/modules/user/healthprofile/routes/healthProfileRoutes'));
app.use('/api/user/reviews', require('./src/modules/user/review/routes/reviewRoutes'));

// 404 핸들러
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Not Found',
    message: '요청하신 리소스를 찾을 수 없습니다.'
  });
});

// 에러 핸들러
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : '서버 오류가 발생했습니다.'
  });
});

// 서버 시작
app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
