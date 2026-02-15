// backend/src/controllers/requestController.js
const Request  = require('../models/Request');
const Provider = require('../models/Provider');
const User     = require('../models/User');

// ── Notify nearby providers via Socket.IO ─────────────────────────────────────
const notifyNearbyProviders = async (request, io) => {
  try {
    const [lng, lat] = request.location.coordinates;
    const providers  = await Provider.find({
      isAvailable: true,
      category:    request.category,
      _id:         { $nin: request.rejectedBy || [] },
      location: {
        $near: {
          $geometry:    { type: 'Point', coordinates: [lng, lat] },
          $maxDistance: 20000, // 20km
        },
      },
    }).populate('user', 'name').limit(10);

    console.log(`📢 Notifying ${providers.length} providers for request: ${request._id}`);

    providers.forEach(provider => {
      io.to(`provider_${provider._id}`).emit('new-request', {
        requestId:   request._id,
        title:       request.title,
        category:    request.category,
        description: request.description,
        budget:      request.budget,
        address:     request.location.address,
        userName:    request.user?.name || 'User',
      });
    });

    // Update notified list
    await Request.findByIdAndUpdate(request._id, {
      $addToSet: { notifiedProviders: { $each: providers.map(p => p._id) } },
    });
  } catch (e) {
    console.error('Notify providers error:', e.message);
  }
};

// ── CREATE REQUEST ─────────────────────────────────────────────────────────────
exports.createRequest = async (req, res) => {
  try {
    const { title, description, category, budget, latitude, longitude, address } = req.body;
    if (!title || !description || !category) {
      return res.status(400).json({ success: false, message: 'Title, description and category are required' });
    }

    const request = await Request.create({
      user:     req.user.id,
      title, description, category,
      budget:   budget || 0,
      location: {
        type:        'Point',
        coordinates: [parseFloat(longitude) || 0, parseFloat(latitude) || 0],
        address:     address || '',
      },
      statusHistory: [{ status: 'pending', message: 'Request created. Finding providers...' }],
    });

    await request.populate('user', 'name email phone');

    // Notify nearby providers
    const io = req.app.get('io');
    if (io) notifyNearbyProviders(request, io);

    res.status(201).json({ success: true, data: request });
  } catch (error) {
    console.error('Create request error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── GET MY REQUESTS (User) ────────────────────────────────────────────────────
exports.getMyRequests = async (req, res) => {
  try {
    const requests = await Request.find({ user: req.user.id })
      .populate('assignedProvider')
      .sort({ createdAt: -1 });
    res.json({ success: true, count: requests.length, data: requests });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── GET PROVIDER REQUESTS (Provider sees nearby requests) ─────────────────────
exports.getProviderRequests = async (req, res) => {
  try {
    const provider = await Provider.findOne({ user: req.user.id });
    if (!provider) return res.status(404).json({ success: false, message: 'Provider profile not found' });

    const requests = await Request.find({
      category: provider.category,
      status:   'pending',
      rejectedBy: { $ne: provider._id },
    })
    .populate('user', 'name phone')
    .sort({ createdAt: -1 })
    .limit(20);

    res.json({ success: true, count: requests.length, data: requests });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── PROVIDER: MAKE OFFER ──────────────────────────────────────────────────────
exports.makeOffer = async (req, res) => {
  try {
    const { price, message } = req.body;
    const request = await Request.findById(req.params.id);
    if (!request) return res.status(404).json({ success: false, message: 'Request not found' });
    if (request.status !== 'pending') return res.status(400).json({ success: false, message: 'Request is no longer available' });

    const provider = await Provider.findOne({ user: req.user.id });
    if (!provider) return res.status(404).json({ success: false, message: 'Provider profile not found' });

    // Check if already made offer
    const existing = request.offers.find(o => o.provider.toString() === provider._id.toString());
    if (existing) return res.status(400).json({ success: false, message: 'You already made an offer' });

    request.offers.push({ provider: provider._id, price, message });
    await request.save();
    await request.populate('offers.provider');

    // Notify user about new offer
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${request.user}`).emit('new-offer', {
        requestId:    request._id,
        requestTitle: request.title,
        providerName: provider.user?.name || 'A Provider',
        price,
        message,
        offerId:      request.offers[request.offers.length - 1]._id,
      });
    }

    res.json({ success: true, message: 'Offer sent successfully', data: request });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── USER: ACCEPT OFFER → moves to payment_pending ────────────────────────────
exports.acceptOffer = async (req, res) => {
  try {
    const { offerId } = req.body;
    const request = await Request.findById(req.params.id);
    if (!request) return res.status(404).json({ success: false, message: 'Request not found' });
    if (request.user.toString() !== req.user.id) return res.status(403).json({ success: false, message: 'Not authorized' });

    const offer = request.offers.id(offerId);
    if (!offer) return res.status(404).json({ success: false, message: 'Offer not found' });

    // Accept this offer
    offer.status            = 'accepted';
    request.acceptedOffer   = offerId;
    request.assignedProvider= offer.provider;
    request.finalAmount     = offer.price;
    request.status          = 'payment_pending';
    request.statusHistory.push({
      status:  'payment_pending',
      message: 'Offer accepted. Please complete payment to confirm booking.',
    });

    // Reject all other offers
    request.offers.forEach(o => {
      if (o._id.toString() !== offerId) o.status = 'rejected';
    });

    await request.save();

    // Notify provider that offer was accepted
    const io = req.app.get('io');
    if (io) {
      io.to(`provider_${offer.provider}`).emit('offer-accepted', {
        requestId:    request._id,
        requestTitle: request.title,
        message:      'Your offer was accepted! Waiting for user payment.',
      });
    }

    // Notify user to pay
    io.to(`user_${request.user}`).emit('request-status-update', {
      requestId: request._id,
      status:    'payment_pending',
      message:   'Offer accepted! Please complete payment to confirm.',
    });

    res.json({ success: true, message: 'Offer accepted. Please complete payment.', data: request });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── PROVIDER: REJECT REQUEST ──────────────────────────────────────────────────
exports.rejectRequest = async (req, res) => {
  try {
    const request  = await Request.findById(req.params.id);
    if (!request) return res.status(404).json({ success: false, message: 'Request not found' });

    const provider = await Provider.findOne({ user: req.user.id });
    if (!provider) return res.status(404).json({ success: false, message: 'Provider not found' });

    // Add to rejected list
    await Request.findByIdAndUpdate(req.params.id, {
      $addToSet: { rejectedBy: provider._id },
    });

    // Notify next available provider
    const updatedRequest = await Request.findById(req.params.id).populate('user', 'name');
    const io = req.app.get('io');
    if (io) notifyNearbyProviders(updatedRequest, io);

    res.json({ success: true, message: 'Request rejected. Passed to next provider.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── USER: CONFIRM PAYMENT ─────────────────────────────────────────────────────
exports.confirmPayment = async (req, res) => {
  try {
    const { paymentId } = req.body;
    const request = await Request.findById(req.params.id);
    if (!request) return res.status(404).json({ success: false, message: 'Request not found' });
    if (request.user.toString() !== req.user.id) return res.status(403).json({ success: false, message: 'Not authorized' });
    if (request.status !== 'payment_pending') return res.status(400).json({ success: false, message: 'Payment not required now' });

    request.status        = 'active';
    request.paymentStatus = 'paid';
    request.paymentId     = paymentId || 'MANUAL_' + Date.now();
    request.statusHistory.push({
      status:  'active',
      message: 'Payment confirmed! Provider is on the way.',
    });
    await request.save();

    // Notify provider to start work
    const io = req.app.get('io');
    if (io) {
      io.to(`provider_${request.assignedProvider}`).emit('payment-confirmed', {
        requestId:    request._id,
        requestTitle: request.title,
        message:      '💰 Payment received! Please start the service.',
        userAddress:  request.location.address,
      });

      // Notify user
      io.to(`user_${request.user}`).emit('request-status-update', {
        requestId: request._id,
        status:    'active',
        message:   '✅ Payment confirmed! Provider is coming to you.',
      });
    }

    res.json({ success: true, message: 'Payment confirmed! Service is now active.', data: request });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── PROVIDER: MARK COMPLETED ──────────────────────────────────────────────────
exports.markCompleted = async (req, res) => {
  try {
    const request  = await Request.findById(req.params.id);
    if (!request) return res.status(404).json({ success: false, message: 'Request not found' });

    const provider = await Provider.findOne({ user: req.user.id });
    if (!provider) return res.status(404).json({ success: false, message: 'Provider not found' });
    if (request.assignedProvider.toString() !== provider._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    if (request.status !== 'active') {
      return res.status(400).json({ success: false, message: 'Service must be active to complete' });
    }

    request.status      = 'completed';
    request.completedAt = new Date();
    request.statusHistory.push({
      status:  'completed',
      message: 'Service completed by provider.',
    });
    await request.save();

    // Update provider stats
    await Provider.findByIdAndUpdate(provider._id, {
      $inc: { completedJobs: 1 },
    });

    // Notify user service is completed
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${request.user}`).emit('request-status-update', {
        requestId: request._id,
        status:    'completed',
        message:   '🎉 Service completed! Please rate your provider.',
      });
    }

    res.json({ success: true, message: 'Service marked as completed!', data: request });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── GET REQUEST BY ID ─────────────────────────────────────────────────────────
exports.getRequestById = async (req, res) => {
  try {
    const request = await Request.findById(req.params.id)
      .populate('user', 'name phone email')
      .populate('assignedProvider')
      .populate('offers.provider');
    if (!request) return res.status(404).json({ success: false, message: 'Request not found' });
    res.json({ success: true, data: request });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── CANCEL REQUEST ────────────────────────────────────────────────────────────
exports.cancelRequest = async (req, res) => {
  try {
    const request = await Request.findById(req.params.id);
    if (!request) return res.status(404).json({ success: false, message: 'Request not found' });
    if (request.user.toString() !== req.user.id) return res.status(403).json({ success: false, message: 'Not authorized' });
    if (['completed', 'cancelled'].includes(request.status)) {
      return res.status(400).json({ success: false, message: 'Cannot cancel this request' });
    }

    request.status = 'cancelled';
    request.statusHistory.push({ status: 'cancelled', message: req.body.reason || 'Cancelled by user' });
    await request.save();

    // Notify provider if assigned
    if (request.assignedProvider) {
      const io = req.app.get('io');
      if (io) {
        io.to(`provider_${request.assignedProvider}`).emit('request-cancelled', {
          requestId: request._id,
          message:   'Request was cancelled by user.',
        });
      }
    }

    res.json({ success: true, message: 'Request cancelled', data: request });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── SEARCH REQUESTS ───────────────────────────────────────────────────────────
exports.searchRequests = async (req, res) => {
  try {
    const { q, latitude, longitude, radius = 20 } = req.query;
    const query = { status: 'pending' };
    if (q) query.$or = [
      { title:       { $regex: q, $options: 'i' } },
      { category:    { $regex: q, $options: 'i' } },
      { description: { $regex: q, $options: 'i' } },
    ];
    const requests = await Request.find(query).populate('user', 'name').limit(10);
    res.json({ success: true, data: requests });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};