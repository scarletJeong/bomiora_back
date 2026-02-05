/**
 * 전역 에러 핸들러 미들웨어
 */
const errorHandler = (err, req, res, next) => {
  // 기본 에러 정보
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal Server Error';
  
  // 개발 환경에서는 상세 에러 정보 포함
  const error = {
    error: message,
    status: status
  };
  
  if (process.env.NODE_ENV === 'development') {
    error.stack = err.stack;
    error.details = err.details;
  }
  
  // 로깅
  console.error(`[ERROR] ${req.method} ${req.path}`, {
    status,
    message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
  
  res.status(status).json(error);
};

/**
 * 404 Not Found 핸들러
 */
const notFoundHandler = (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `경로 ${req.path}를 찾을 수 없습니다.`,
    status: 404
  });
};

module.exports = {
  errorHandler,
  notFoundHandler
};
