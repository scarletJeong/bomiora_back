const express = require('express');
const router = express.Router();
const userController = require('../controllers/UserController');

/**
 * @route   POST /api/auth/login
 * @desc    로그인
 * @access  Public
 */
router.post('/login', (req, res) => userController.login(req, res));

/**
 * @route   POST /api/auth/register
 * @desc    회원가입
 * @access  Public
 */
router.post('/register', (req, res) => userController.register(req, res));

module.exports = router;
