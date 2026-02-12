const express = require('express');
const router = express.Router();
const shopDefaultController = require('../controllers/ShopDefaultController');

router.get('/reservation-settings', (req, res) => shopDefaultController.getReservationSettings(req, res));

module.exports = router;
