const express = require('express');
const router = express.Router();
const userController = require('../controllers/UserController');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const mbId = req.body.mbId || req.body.mb_id || req.query.mbId || req.query.mb_id || 'anonymous';
    const uploadDir = path.join(process.cwd(), 'uploads', 'profiles', String(mbId));
    fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
    cb(null, `${Date.now()}_${Math.round(Math.random() * 1e9)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const mimeOk = /^image\/(jpeg|jpg|png|webp)$/.test(file.mimetype || '');
    const ext = path.extname(file.originalname || '').toLowerCase();
    const extOk = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext);
    // 웹에서는 mimetype이 application/octet-stream으로 오는 경우가 있어 확장자도 함께 허용
    const ok = mimeOk || extOk;
    if (!ok) return cb(new Error('이미지 파일(jpg, png, webp)만 업로드 가능합니다.'));
    cb(null, true);
  },
});

/**
 * @route   PUT /api/user/profile
 * @desc    프로필 수정
 * @access  Private (추후 인증 미들웨어 추가)
 */
router.put('/profile', (req, res) => userController.updateProfile(req, res));
router.post('/profile/image', upload.single('file'), (req, res) =>
  userController.uploadProfileImage(req, res)
);

module.exports = router;
