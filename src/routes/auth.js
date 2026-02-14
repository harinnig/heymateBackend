// backend/src/routes/auth.js
const express = require('express');
const router  = express.Router();
const { protect } = require('../middleware/auth');
const {
  register,
  login,
  getProfile,
  updateProfile,
} = require('../controllers/authController');

router.post('/register', register);
router.post('/login',    login);
router.get( '/profile',  protect, getProfile);
router.put( '/profile',  protect, updateProfile);

module.exports = router;