const express = require('express');
const router = express.Router();
const bannerController = require('../controllers/BannerController');

router.get('/', (req, res) => bannerController.getActiveList(req, res));

module.exports = router;
