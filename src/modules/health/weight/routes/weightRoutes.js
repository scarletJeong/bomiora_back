const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const weightController = require('../controllers/WeightController');

const router = express.Router();
const uploadDir = weightController.getUploadDir();

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname || '') || '.jpg';
    cb(null, `${crypto.randomUUID()}${extension}`);
  }
});

const upload = multer({ storage });

router.post('/upload-image', upload.single('file'), (req, res) => weightController.uploadImage(req, res));
router.get('/images/:filename', (req, res) => weightController.getImage(req, res));
router.post('/', (req, res) => weightController.createWeight(req, res));
router.put('/:recordId', (req, res) => weightController.updateWeight(req, res));
router.delete('/:recordId', (req, res) => weightController.deleteWeight(req, res));
router.get('/latest', (req, res) => weightController.getLatestWeight(req, res));
router.get('/:date', (req, res) => weightController.getWeightsByDate(req, res));
router.get('/', (req, res) => weightController.getWeights(req, res));

module.exports = router;
