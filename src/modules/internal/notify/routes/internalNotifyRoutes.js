const express = require('express');
const router = express.Router();
const internalNotifyController = require('../controllers/InternalNotifyController');

router.post('/notify', (req, res) => internalNotifyController.notify(req, res));
router.post('/jobs/coupon-expiry', (req, res) =>
  internalNotifyController.runCouponExpiryJob(req, res)
);

module.exports = router;
