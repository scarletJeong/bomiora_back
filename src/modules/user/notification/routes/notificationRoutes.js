const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/NotificationController');

router.post('/fcm-token', (req, res) => notificationController.registerFcmToken(req, res));
router.get('/notification-settings', (req, res) =>
  notificationController.getNotificationSettings(req, res)
);
router.put('/notification-settings', (req, res) =>
  notificationController.updateNotificationSettings(req, res)
);
router.post('/fcm-test', (req, res) => notificationController.sendTestPush(req, res));

module.exports = router;
