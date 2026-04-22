const express = require('express');
const router = express.Router();
const otpController = require('../controllers/OtpController');

/**
 * @route   POST /api/auth/otp/send
 * @desc    OTP 발송(알림톡) + otp_token 발급
 * @access  Public
 */
router.post('/send', (req, res) => otpController.send(req, res));

/**
 * @route   POST /api/auth/otp/verify
 * @desc    OTP 검증 (otp_token + code)
 * @access  Public
 */
router.post('/verify', (req, res) => otpController.verify(req, res));

module.exports = router;

