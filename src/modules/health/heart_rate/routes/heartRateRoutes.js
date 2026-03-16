const express = require('express');
const router = express.Router();
const heartRateController = require('../controllers/HeartRateController');

router.post('/', (req, res) => heartRateController.addRecord(req, res));
router.get('/', (req, res) => heartRateController.getRecords(req, res));
router.get('/latest', (req, res) => heartRateController.getLatestRecord(req, res));
router.get('/range', (req, res) => heartRateController.getRecordsByDateRange(req, res));
router.get('/count', (req, res) => heartRateController.getRecordCount(req, res));

module.exports = router;
