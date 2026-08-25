const express = require('express');
const healthDashboardController = require('../controllers/HealthDashboardController');

const router = express.Router();

router.get('/', (req, res) => healthDashboardController.getDashboard(req, res));

module.exports = router;
