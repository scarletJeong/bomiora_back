const express = require('express');
const router = express.Router();
const bloodPressureController = require('../controllers/BloodPressureController');

router.post('/', (req, res) => bloodPressureController.addRecord(req, res));
router.put('/:id', (req, res) => bloodPressureController.updateRecord(req, res));
router.delete('/:id', (req, res) => bloodPressureController.deleteRecord(req, res));
router.get('/', (req, res) => bloodPressureController.getRecords(req, res));
router.get('/latest', (req, res) => bloodPressureController.getLatestRecord(req, res));
router.get('/range', (req, res) => bloodPressureController.getRecordsByDateRange(req, res));
router.get('/count', (req, res) => bloodPressureController.getRecordCount(req, res));

module.exports = router;
