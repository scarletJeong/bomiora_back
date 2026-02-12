const express = require('express');
const router = express.Router();
const bloodSugarController = require('../controllers/BloodSugarController');

router.post('/', (req, res) => bloodSugarController.addRecord(req, res));
router.get('/latest', (req, res) => bloodSugarController.getLatestRecord(req, res));
router.get('/range', (req, res) => bloodSugarController.getRecordsByDateRange(req, res));
router.get('/type', (req, res) => bloodSugarController.getRecordsByMeasurementType(req, res));
router.get('/status', (req, res) => bloodSugarController.getRecordsByStatus(req, res));
router.get('/count/range', (req, res) => bloodSugarController.getRecordCountByDateRange(req, res));
router.get('/count', (req, res) => bloodSugarController.getRecordCount(req, res));
router.get('/', (req, res) => bloodSugarController.getRecords(req, res));
router.put('/:id', (req, res) => bloodSugarController.updateRecord(req, res));
router.delete('/:id', (req, res) => bloodSugarController.deleteRecord(req, res));

module.exports = router;
