const express = require('express');
const socialAuthController = require('../controllers/SocialAuthController');

const router = express.Router();

router.post('/social/login', (req, res) => socialAuthController.login(req, res));
router.post('/social/register', (req, res) => socialAuthController.register(req, res));
router.post('/kakao/login', (req, res) => socialAuthController.loginKakao(req, res));
router.post('/naver/login', (req, res) => socialAuthController.loginNaver(req, res));

module.exports = router;
