const express = require('express');
const router = express.Router();
const userController = require('../controllers/UserController');

/**
 * @route   PUT /api/user/profile
 * @desc    프로필 수정
 * @access  Private (추후 인증 미들웨어 추가)
 */
router.put('/profile', (req, res) => userController.updateProfile(req, res));

module.exports = router;
