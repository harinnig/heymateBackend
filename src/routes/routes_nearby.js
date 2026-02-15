// backend/src/routes/nearby.js
const express    = require('express');
const router     = express.Router();
const { getNearbyShops } = require('../controllers/nearbyController');

router.get('/shops', getNearbyShops);

module.exports = router;
