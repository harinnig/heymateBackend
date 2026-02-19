// backend/src/routes/nearby.js
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { getNearbyShops } = require('../controllers/nearbyController');

router.get('/shops', protect, getNearbyShops);

module.exports = router;