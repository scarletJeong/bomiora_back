const express = require('express');
const router = express.Router();
const configController = require('../controllers/ConfigController');

router.get('/', (req, res) => configController.getConfig(req, res));

module.exports = router;
