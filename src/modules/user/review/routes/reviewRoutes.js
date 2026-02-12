const express = require('express');
const router = express.Router();
const reviewController = require('../controllers/ReviewController');

router.post('/', (req, res) => reviewController.createReview(req, res));
router.get('/product/:itId/stats', (req, res) => reviewController.getProductReviewStats(req, res));
router.get('/product/:itId', (req, res) => reviewController.getProductReviews(req, res));
router.get('/member/:mbId', (req, res) => reviewController.getMemberReviews(req, res));
router.get('/check', (req, res) => reviewController.checkReviewExists(req, res));
router.get('/:isId/helpful/check', (req, res) => reviewController.checkUserHelpful(req, res));
router.post('/:isId/helpful', (req, res) => reviewController.incrementReviewHelpful(req, res));
router.get('/:isId', (req, res) => reviewController.getReviewById(req, res));
router.put('/:isId', (req, res) => reviewController.updateReview(req, res));
router.delete('/:isId', (req, res) => reviewController.deleteReview(req, res));
router.get('/', (req, res) => reviewController.getAllReviews(req, res));

module.exports = router;
