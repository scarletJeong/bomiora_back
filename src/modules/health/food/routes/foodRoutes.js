const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const router = express.Router();
const foodController = require('../controllers/FoodController');
const foodRecordController = require('../controllers/FoodRecordController');

const uploadDir = foodRecordController.getUploadDir();

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

// 식사 사진 업로드·조회 (체중 모듈과 동일 패턴)
router.post(
  '/upload-image',
  upload.single('file'),
  (req, res) => foodRecordController.uploadImage(req, res)
);
router.get('/images/:filename', (req, res) =>
  foodRecordController.getImage(req, res)
);

// 음식 검색 (food_name → 칼로리/탄수화물/단백질/지방)
router.get('/search', (req, res) => foodController.search(req, res));
// 식사 기록 (반드시 /:foodCode 보다 위에)
router.get('/records', (req, res) => foodRecordController.getByDate(req, res));
router.post('/records', (req, res) => foodRecordController.create(req, res));
router.put('/records/:foodRecordId', (req, res) =>
  foodRecordController.update(req, res)
);
router.post('/records/:foodRecordId/items', (req, res) =>
  foodRecordController.addFoodItem(req, res)
);
router.delete('/records/:foodRecordId/items/:itemId', (req, res) =>
  foodRecordController.deleteFoodItem(req, res)
);
router.delete('/records/:foodRecordId', (req, res) =>
  foodRecordController.delete(req, res)
);
// 식품코드로 1건 조회
router.get('/:foodCode', (req, res) => foodController.getByFoodCode(req, res));

module.exports = router;
