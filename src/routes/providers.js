// backend/src/routes/providers.js
const express = require('express');
const router  = express.Router();
const { protect } = require('../middleware/auth');
const {
  registerProvider, getNearbyProviders, getProviderProfile,
  getMyProfile, updateProfile, toggleAvailability,
} = require('../controllers/providerController');

router.post('/register',          protect, registerProvider);
router.get('/nearby',                      getNearbyProviders);
router.get('/profile',            protect, getMyProfile);
router.put('/profile',            protect, updateProfile);
router.put('/availability',       protect, toggleAvailability);
router.get('/:userId',                     getProviderProfile);

module.exports = router;