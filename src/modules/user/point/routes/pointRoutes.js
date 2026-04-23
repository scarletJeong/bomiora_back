const express = require('express');
const router = express.Router();
const pointController = require('../controllers/PointController');

router.get('/point', (req, res) => pointController.getUserPoint(req, res));
router.get('/point/history', (req, res) => pointController.getPointHistory(req, res));
router.post('/point/daily-first-login', (req, res) =>
  pointController.dailyFirstLoginPoint(req, res)
);

module.exports = router;
