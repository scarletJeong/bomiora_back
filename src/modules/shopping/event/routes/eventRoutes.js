const express = require('express');
const router = express.Router();
const eventController = require('../controllers/EventController');

router.get('/active', (req, res) => eventController.getActiveEvents(req, res));
router.get('/ended', (req, res) => eventController.getEndedEvents(req, res));
router.get('/:wrId', (req, res) => eventController.getEventDetail(req, res));

module.exports = router;
