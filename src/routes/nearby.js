// backend/src/routes/nearby.js
const express    = require('express');
const router     = express.Router();
const { getNearbyShops, getPlaceDetails } = require('../controllers/nearbyController');

router.get('/shops',           getNearbyShops);
router.get('/details/:placeId', getPlaceDetails);

module.exports = router;
