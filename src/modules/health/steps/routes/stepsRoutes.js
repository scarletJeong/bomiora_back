const express = require('express');
const router = express.Router();
const stepsController = require('../controllers/StepsController');

router.post('/', (req, res) => stepsController.createStepsRecord(req, res));
router.put('/:recordId', (req, res) => stepsController.updateStepsRecord(req, res));
router.delete('/:recordId', (req, res) => stepsController.deleteStepsRecord(req, res));
/** 일별 총 걸음 — 앱용: 항상 { success, data }, 기록 없음도 200 */
router.get('/daily-total', (req, res) => stepsController.getDailyTotal(req, res));
router.get('/daily-range', (req, res) => stepsController.getDailyRangeTotals(req, res));
router.get('/monthly-totals', (req, res) => stepsController.getMonthlyTotalsForYear(req, res));
router.get('/today/:userId', (req, res) => stepsController.getTodayStepsRecord(req, res));
router.get('/date/:userId', (req, res) => stepsController.getStepsRecordByDate(req, res));
router.get('/weekly/:userId', (req, res) => stepsController.getWeeklyStepsRecords(req, res));
router.get('/monthly/:userId', (req, res) => stepsController.getMonthlyStepsRecords(req, res));
router.get('/statistics/:userId', (req, res) => stepsController.getStepsStatistics(req, res));

module.exports = router;
