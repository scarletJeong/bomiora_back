const express = require('express');
const router = express.Router();
const userController = require('../controllers/UserController');
const kcpRoutes = require('./kcpRoutes');

/**
 * @route   POST /api/auth/login
 * @desc    로그인
 * @access  Public
 */
router.post('/login', (req, res) => userController.login(req, res));
router.post('/check-email', (req, res) => userController.checkEmail(req, res));

/**
 * @route   POST /api/auth/register
 * @desc    회원가입
 * @access  Public
 */
router.post('/register', (req, res) => userController.register(req, res));
router.post('/find-id', (req, res) => userController.findId(req, res));
router.use('/kcp', kcpRoutes);

module.exports = router;
