const express = require('express');
const router = express.Router();
const userController = require('../controllers/UserController');
const kcpRoutes = require('./kcpRoutes');
const otpRoutes = require('./otpRoutes');

/**
 * @route   POST /api/auth/login
 * @desc    로그인
 * @access  Public
 */
router.post('/login', (req, res) => userController.login(req, res));
router.post('/kakao/login', (req, res) => userController.loginWithKakao(req, res));
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
router.use('/kcp', kcpRoutes);
router.use('/otp', otpRoutes);

module.exports = router;
