const express = require('express');
const router = express.Router();
const contactController = require('../controllers/ContactController');

router.get('/list', (req, res) => contactController.getMyContacts(req, res));
router.get('/:wrId/replies', (req, res) => contactController.getContactReplies(req, res));
router.get('/:wrId', (req, res) => contactController.getContactDetail(req, res));
router.post('/create', (req, res) => contactController.createContact(req, res));
router.put('/:wrId', (req, res) => contactController.updateContact(req, res));

module.exports = router;
