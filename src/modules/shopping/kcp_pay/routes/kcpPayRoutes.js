const express = require('express');
const router = express.Router();
const kcpPayController = require('../controllers/KcpPayController');

router.post('/request', (req, res) => kcpPayController.request(req, res));
router.get('/launch/:token', (req, res) => kcpPayController.launch(req, res));
router.post('/callback', (req, res) => kcpPayController.callback(req, res));
router.post('/common', (req, res) => kcpPayController.common(req, res));
router.get('/result/:token', (req, res) => kcpPayController.getResult(req, res));

module.exports = router;
