const express = require('express');
const router = express.Router();
const healthGoalController = require('../controllers/HealthGoalController');

router.get('/latest', (req, res) => healthGoalController.getLatest(req, res));
router.post('/', (req, res) => healthGoalController.register(req, res));

module.exports = router;
