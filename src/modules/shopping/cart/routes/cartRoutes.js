const express = require('express');
const router = express.Router();
const cartController = require('../controllers/CartController');

router.post('/add', (req, res) => cartController.addToCart(req, res));
router.get('/', (req, res) => cartController.getCart(req, res));
router.post('/generate-order-id', (req, res) => cartController.generateOrderIdEndpoint(req, res));
router.post('/healthprofile', (req, res) => cartController.saveHealthProfileForPrescription(req, res));
router.post('/save-health-profile-cart', (req, res) => cartController.saveHealthProfileCart(req, res));
router.put('/update/:ctId', (req, res) => cartController.updateCartQuantity(req, res));
router.delete('/remove/:ctId', (req, res) => cartController.removeCartItem(req, res));

module.exports = router;
