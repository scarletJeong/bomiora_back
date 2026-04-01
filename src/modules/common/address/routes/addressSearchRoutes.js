const express = require('express');
const router = express.Router();
const addressSearchController = require('../controllers/AddressSearchController');

router.get('/search', (req, res) => addressSearchController.search(req, res));
router.post('/resolve', (req, res) => addressSearchController.resolve(req, res));
router.get('/postcode-bridge', (req, res) => addressSearchController.renderPostcodeBridge(req, res));
router.get('/postcode-bridge/result', (req, res) => addressSearchController.renderPostcodeBridgeResult(req, res));
router.get('/postcode-bridge/poll', (req, res) => addressSearchController.pollPostcodeBridge(req, res));

module.exports = router;
