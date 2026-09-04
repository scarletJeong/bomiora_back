const express = require('express');
const router = express.Router();
const userController = require('../controllers/UserController');
const socialAuthController = require('../../user/social/controllers/SocialAuthController');
const naverOAuthController = require('../controllers/NaverOAuthController');
const kakaoOAuthController = require('../controllers/KakaoOAuthController');
const adminLoginTokenController = require('../controllers/AdminLoginTokenController');
const kcpRoutes = require('./kcpRoutes');
const otpRoutes = require('./otpRoutes');

/**
 * @route   POST /api/auth/login
 * @desc    로그인
 * @access  Public
 */
router.post('/login', (req, res) => userController.login(req, res));
router.post('/kakao/login', (req, res) => socialAuthController.loginKakao(req, res));
router.post('/naver/login', (req, res) => socialAuthController.loginNaver(req, res));
router.get('/naver/authorize', (req, res) => naverOAuthController.authorize(req, res));
router.get('/naver/callback', (req, res) => naverOAuthController.callback(req, res));
router.get('/naver/result/:token', (req, res) => naverOAuthController.result(req, res));
router.get('/kakao/authorize', (req, res) => kakaoOAuthController.authorize(req, res));
router.get('/kakao/callback', (req, res) => kakaoOAuthController.callback(req, res));
router.get('/kakao/result/:token', (req, res) => kakaoOAuthController.result(req, res));
router.post('/social/login', (req, res) => socialAuthController.login(req, res));
router.post('/social/register', (req, res) => socialAuthController.register(req, res));
router.post('/check-email', (req, res) => userController.checkEmail(req, res));
router.post('/check-dup-info', (req, res) => userController.checkDupInfo(req, res));

/**
 * @route   POST /api/auth/register
 * @desc    회원가입
 * @access  Public
 */
router.post('/register', (req, res) => userController.register(req, res));
router.post('/find-id', (req, res) => userController.findId(req, res));
router.post('/forgot-password', (req, res) => userController.forgotPassword(req, res));
router.post('/reset-password', (req, res) => userController.resetPassword(req, res));
router.post('/withdraw', (req, res) => userController.withdraw(req, res));
router.get('/session', (req, res) => userController.session(req, res));
router.post('/admin-login-token', (req, res) =>
  adminLoginTokenController.issue(req, res)
);
router.post('/admin-login-token/consume', (req, res) =>
  adminLoginTokenController.consume(req, res)
);
router.use('/kcp', kcpRoutes);
router.use('/otp', otpRoutes);

module.exports = router;
