const express = require('express');
const router = express.Router();
const announcementController = require('../controllers/AnnouncementController');

router.get('/list', (req, res) => announcementController.getList(req, res));
router.get('/:id', (req, res) => announcementController.getDetail(req, res));

module.exports = router;
