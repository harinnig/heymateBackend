// backend/src/routes/reviews.js
const express = require('express');
const router  = express.Router();
const { protect } = require('../middleware/auth');

// POST /api/reviews
router.post('/', protect, async (req, res) => {
  try {
    res.status(201).json({ success: true, message: 'Review submitted', data: req.body });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/reviews/provider/:id
router.get('/provider/:id', async (req, res) => {
  try {
    res.json({ success: true, data: [], averageRating: 0, count: 0 });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
