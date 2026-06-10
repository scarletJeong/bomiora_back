const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const router = express.Router();
const reviewController = require('../controllers/ReviewController');

const uploadDir = reviewController.getUploadDir();
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

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }
});

router.post('/upload-image', upload.single('file'), (req, res) => reviewController.uploadImage(req, res));
router.get('/images/:filename', (req, res) => reviewController.getImage(req, res));

router.post('/', (req, res) => reviewController.createReview(req, res));
router.get('/product/:itId/stats', (req, res) => reviewController.getProductReviewStats(req, res));
router.get('/product/:itId', (req, res) => reviewController.getProductReviews(req, res));
router.get('/member/:mbId', (req, res) => reviewController.getMemberReviews(req, res));
router.get('/check', (req, res) => reviewController.checkReviewExists(req, res));
router.get('/main', (req, res) => reviewController.getMainReviews(req, res));
router.get('/:isId/helpful/check', (req, res) => reviewController.checkUserHelpful(req, res));
router.post('/:isId/helpful', (req, res) => reviewController.incrementReviewHelpful(req, res));
router.get('/:isId', (req, res) => reviewController.getReviewById(req, res));
router.put('/:isId', (req, res) => reviewController.updateReview(req, res));
router.delete('/:isId', (req, res) => reviewController.deleteReview(req, res));
router.get('/', (req, res) => reviewController.getAllReviews(req, res));

module.exports = router;
