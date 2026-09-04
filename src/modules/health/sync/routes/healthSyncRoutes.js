const express = require('express');
const router = express.Router();
const healthSyncController = require('../controllers/HealthSyncController');

router.post('/', (req, res) => healthSyncController.syncToday(req, res));

module.exports = router;
