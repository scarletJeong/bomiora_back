const express = require('express');
const router = express.Router();
const healthProfileController = require('../controllers/HealthProfileController');

router.get('/:userId/exists', (req, res) => healthProfileController.hasHealthProfile(req, res));
router.get('/:userId/analysis', (req, res) => healthProfileController.analyzeHealthProfile(req, res));
router.get('/:userId', (req, res) => healthProfileController.getHealthProfile(req, res));
router.post('/', (req, res) => healthProfileController.saveHealthProfile(req, res));
router.put('/:pfNo', (req, res) => healthProfileController.updateHealthProfile(req, res));
router.delete('/:pfNo', (req, res) => healthProfileController.deleteHealthProfile(req, res));

module.exports = router;
