const express = require('express');
const router = express.Router();
const productController = require('../controllers/ProductController');

router.get('/list', (req, res) => productController.getProductsByCategory(req, res));
router.get('/detail', (req, res) => productController.getProductDetail(req, res));
router.get('/popular', (req, res) => productController.getPopularProducts(req, res));
router.get('/new', (req, res) => productController.getNewProducts(req, res));
router.get('/:productId/options', (req, res) => productController.getProductOptions(req, res));

module.exports = router;
