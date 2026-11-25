const express = require('express');
const clientFailureLogController = require('../controllers/ClientFailureLogController');

const router = express.Router();

router.post('/', (req, res) => clientFailureLogController.create(req, res));

module.exports = router;
