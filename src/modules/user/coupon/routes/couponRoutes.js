const express = require('express');
const router = express.Router();
const couponController = require('../controllers/CouponController');

router.get('/coupons', (req, res) => couponController.getUserCoupons(req, res));
router.get('/coupons/available', (req, res) => couponController.getAvailableCoupons(req, res));
router.get('/coupons/used', (req, res) => couponController.getUsedCoupons(req, res));
router.get('/coupons/expired', (req, res) => couponController.getExpiredCoupons(req, res));
router.post('/coupons/register', (req, res) => couponController.registerCoupon(req, res));
router.post('/coupons/help-coupon', (req, res) => couponController.downloadHelpCoupon(req, res));

module.exports = router;
