const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const router = express.Router();
const qaController = require('../controllers/QaController');

const uploadDir = qaController.getUploadDir();
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
    const safe = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}${ext}`;
    cb(null, safe);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
});

router.get('/list', (req, res) => qaController.getMyList(req, res));
router.post('/upload-image', upload.single('file'), (req, res) =>
  qaController.uploadImage(req, res)
);
router.get('/images/:filename', (req, res) => qaController.getImage(req, res));
router.get('/:wrId/replies', (req, res) => qaController.getReplies(req, res));
router.get('/:wrId', (req, res) => qaController.getDetail(req, res));
router.post('/create', (req, res) => qaController.create(req, res));
router.put('/:wrId', (req, res) => qaController.update(req, res));
router.delete('/:wrId', (req, res) => qaController.delete(req, res));

module.exports = router;
