const express = require('express');
const router = express.Router();
const orderController = require('../controllers/OrderController');

router.get('/', (req, res) => orderController.getOrderList(req, res));
router.get('/:odId', (req, res) => orderController.getOrderDetail(req, res));
router.post('/:odId/cancel', (req, res) => orderController.cancelOrder(req, res));
router.post('/:odId/confirm', (req, res) => orderController.confirmPurchase(req, res));
router.post('/batch/auto-confirm', (req, res) => orderController.processAutoConfirm(req, res));
router.put('/:odId/reservation', (req, res) => orderController.changeReservationTime(req, res));

module.exports = router;
