const express = require('express');
const router = express.Router();
const qaController = require('../controllers/QaController');

router.get('/list', (req, res) => qaController.getMyList(req, res));
router.get('/:wrId/replies', (req, res) => qaController.getReplies(req, res));
router.get('/:wrId', (req, res) => qaController.getDetail(req, res));
router.post('/create', (req, res) => qaController.create(req, res));
router.put('/:wrId', (req, res) => qaController.update(req, res));
router.delete('/:wrId', (req, res) => qaController.delete(req, res));

module.exports = router;
