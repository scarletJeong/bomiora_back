const express = require('express');
const router = express.Router();
const addressController = require('../controllers/AddressController');

router.get('/', (req, res) => addressController.getAddressList(req, res));
router.get('/:id', (req, res) => addressController.getAddressDetail(req, res));
router.post('/', (req, res) => addressController.addAddress(req, res));
router.put('/:id', (req, res) => addressController.updateAddress(req, res));
router.delete('/:id', (req, res) => addressController.deleteAddress(req, res));

module.exports = router;
