const express = require('express');
const router = express.Router();
const imageProxyController = require('../controllers/ImageProxyController');

router.get('/image', (req, res) => imageProxyController.proxyImage(req, res));

module.exports = router;
