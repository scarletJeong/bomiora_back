const express = require('express');
const router = express.Router();
const kcpController = require('../controllers/KcpController');

router.get('/request', (req, res) => kcpController.request(req, res));
router.post('/callback', (req, res) => kcpController.callback(req, res));
router.get('/result/:token', (req, res) => kcpController.getResult(req, res));

module.exports = router;
