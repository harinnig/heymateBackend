// backend/src/controllers/paymentController.js
const Razorpay = require('razorpay');
const crypto   = require('crypto');
const Request  = require('../models/Request');

// Initialize Razorpay (you need to add these to Railway env vars)
const razorpay = new Razorpay({
  key_id:     process.env.RAZORPAY_KEY_ID     || 'rzp_test_your_key_id',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'your_key_secret',
});

// ── CREATE PAYMENT ORDER ──────────────────────────────────────────────────────
exports.createOrder = async (req, res) => {
  try {
    const { requestId, amount, method } = req.body;

    if (!requestId || !amount) {
      return res.status(400).json({ success: false, message: 'Request ID and amount required' });
    }

    const request = await Request.findById(requestId);
    if (!request) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }

    if (request.user.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    // ── Method: Cash on Service ──
    if (method === 'cash') {
      request.paymentStatus = 'unpaid';
      request.paymentId     = 'CASH_PENDING_' + Date.now();
      request.status        = 'active';
      await request.save();

      return res.json({
        success: true,
        message: 'Cash payment accepted. Service will start.',
        paymentId: request.paymentId,
      });
    }

    // ── Method: Razorpay ──
    if (method === 'razorpay') {
      const options = {
        amount:   amount * 100, // paise
        currency: 'INR',
        receipt:  `receipt_${requestId}_${Date.now()}`,
        notes: {
          requestId: requestId.toString(),
          userId:    req.user.id,
          requestTitle: request.title,
        },
      };

      const order = await razorpay.orders.create(options);

      // Payment URL for WebView
      const paymentUrl = `https://api.razorpay.com/v1/checkout/embedded?key_id=${process.env.RAZORPAY_KEY_ID}&order_id=${order.id}&amount=${amount * 100}&currency=INR&name=HeyMate&description=${request.title}&prefill[contact]=${req.user.phone || ''}&prefill[email]=${req.user.email || ''}&callback_url=heymateapp://payment/success&cancel_url=heymateapp://payment/failure`;

      return res.json({
        success: true,
        orderId: order.id,
        paymentUrl,
        amount,
      });
    }

    // ── Method: PhonePe / Paytm (placeholder - integrate their SDKs) ──
    if (method === 'phonepe' || method === 'paytm') {
      // For now return mock URL - replace with actual PhonePe/Paytm integration
      return res.json({
        success: false,
        message: `${method} integration coming soon. Use Razorpay or Cash for now.`,
      });
    }

    res.status(400).json({ success: false, message: 'Invalid payment method' });
  } catch (error) {
    console.error('Payment order error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── VERIFY RAZORPAY PAYMENT ───────────────────────────────────────────────────
exports.verifyPayment = async (req, res) => {
  try {
    const { orderId, paymentId, signature, requestId } = req.body;

    // Verify signature
    const body = orderId + '|' + paymentId;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');

    if (expectedSignature !== signature) {
      return res.status(400).json({ success: false, message: 'Invalid signature' });
    }

    // Update request
    const request = await Request.findById(requestId);
    if (!request) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }

    request.paymentStatus = 'paid';
    request.paymentId     = paymentId;
    request.status        = 'active';
    await request.save();

    res.json({ success: true, message: 'Payment verified successfully', data: request });
  } catch (error) {
    console.error('Payment verification error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── GET PAYMENT HISTORY ───────────────────────────────────────────────────────
exports.getPaymentHistory = async (req, res) => {
  try {
    const requests = await Request.find({
      user: req.user.id,
      paymentStatus: { $in: ['paid', 'refunded'] },
    })
    .populate('assignedProvider')
    .select('title finalAmount paymentId paymentStatus createdAt')
    .sort({ createdAt: -1 })
    .limit(20);

    res.json({ success: true, data: requests });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
EOF
echo "Payment controller created"