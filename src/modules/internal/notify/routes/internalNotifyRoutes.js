const express = require('express');
const router = express.Router();
const internalNotifyController = require('../controllers/InternalNotifyController');

router.post('/notify', (req, res) => internalNotifyController.notify(req, res));

module.exports = router;
