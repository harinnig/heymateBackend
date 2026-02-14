// backend/src/routes/payments.js
const express = require('express');
const router  = express.Router();
const { protect } = require('../middleware/auth');

// POST /api/payments/create-order
router.post('/create-order', protect, async (req, res) => {
  try {
    const { amount, currency = 'INR' } = req.body;
    if (!amount) return res.status(400).json({ success: false, message: 'Amount required' });

    // Razorpay integration placeholder
    // In production: use razorpay.orders.create()
    res.json({
      success: true,
      data: {
        orderId:   `order_${Date.now()}`,
        amount,
        currency,
        key:       process.env.RAZORPAY_KEY_ID || 'rzp_test_placeholder',
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/payments/verify
router.post('/verify', protect, async (req, res) => {
  try {
    res.json({ success: true, message: 'Payment verified' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
