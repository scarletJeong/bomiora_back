const express = require('express');
const router = express.Router();
const menstrualCycleController = require('../controllers/MenstrualCycleController');

router.post('/', (req, res) => menstrualCycleController.addRecord(req, res));
router.put('/:id', (req, res) => menstrualCycleController.updateRecord(req, res));
router.delete('/:id', (req, res) => menstrualCycleController.deleteRecord(req, res));
router.get('/', (req, res) => menstrualCycleController.getRecords(req, res));
router.get('/latest', (req, res) => menstrualCycleController.getLatestRecord(req, res));
router.get('/range', (req, res) => menstrualCycleController.getRecordsByDateRange(req, res));
router.get('/stats', (req, res) => menstrualCycleController.getStats(req, res));

module.exports = router;
