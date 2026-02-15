// backend/src/routes/auth.js
const express    = require('express');
const router     = express.Router();
const {
  register, login, getProfile, updateProfile,
  forgotPassword, resetPassword,
} = require('../controllers/authController');
const { protect } = require('../middleware/auth');

router.post('/register',        register);
router.post('/login',           login);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password',  resetPassword);
router.get('/profile',          protect, getProfile);
router.put('/profile',          protect, updateProfile);

module.exports = router;