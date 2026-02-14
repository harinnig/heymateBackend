// backend/src/controllers/requestController.js
const Request = require('../models/Request');

// ── CREATE REQUEST ────────────────────────────────────────────────────────────
exports.createRequest = async (req, res) => {
  try {
    const { title, description, category, budget, latitude, longitude, address, searchRadius } = req.body;

    if (!title)    return res.status(400).json({ success: false, message: 'Title is required' });
    if (!category) return res.status(400).json({ success: false, message: 'Category is required' });

    const request = await Request.create({
      user:         req.user.id,
      title:        title.trim(),
      description:  description || '',
      category,
      budget:       budget ? Number(budget) : null,
      searchRadius: searchRadius || 10,
      location: {
        type:        'Point',
        coordinates: [parseFloat(longitude) || 0, parseFloat(latitude) || 0],
        address:     address || '',
      },
    });

    await request.populate('user', 'name email phone');

    // Notify nearby providers via socket
    try {
      const io = req.app.get('io');
      if (io) {
        io.to('providers').emit('new-request-nearby', {
          requestId: request._id,
          title:     request.title,
          category:  request.category,
          budget:    request.budget,
          location:  { latitude, longitude, address },
          userName:  request.user?.name,
        });
      }
    } catch (e) { console.log('Socket error:', e.message); }

    res.status(201).json({ success: true, message: 'Request posted!', data: request });

  } catch (err) {
    console.error('Create request error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET MY REQUESTS ───────────────────────────────────────────────────────────
exports.getMyRequests = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = { user: req.user.id };
    if (status) filter.status = status;

    const requests = await Request.find(filter)
      .populate('user',             'name email phone profileImage')
      .populate('assignedProvider', 'name email phone profileImage')
      .populate('offers.provider',  'name email phone profileImage')
      .sort({ createdAt: -1 });

    res.json({ success: true, count: requests.length, data: requests });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET NEARBY REQUESTS (for providers) ──────────────────────────────────────
exports.getNearbyRequests = async (req, res) => {
  try {
    const { latitude, longitude, radius = 10, category } = req.query;

    const filter = { status: 'pending' };
    if (category) filter.category = category;

    let requests;
    if (latitude && longitude) {
      try {
        requests = await Request.find({
          ...filter,
          location: {
            $near: {
              $geometry:    { type: 'Point', coordinates: [parseFloat(longitude), parseFloat(latitude)] },
              $maxDistance: parseFloat(radius) * 1000,
            },
          },
        })
          .populate('user',           'name phone profileImage')
          .populate('offers.provider','name')
          .sort({ createdAt: -1 })
          .limit(50);
      } catch (geoErr) {
        // Fallback if geo index not ready
        requests = await Request.find(filter)
          .populate('user',           'name phone profileImage')
          .populate('offers.provider','name')
          .sort({ createdAt: -1 })
          .limit(50);
      }
    } else {
      requests = await Request.find(filter)
        .populate('user',           'name phone profileImage')
        .populate('offers.provider','name')
        .sort({ createdAt: -1 })
        .limit(50);
    }

    res.json({ success: true, count: requests.length, data: requests });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── SEARCH NEARBY SERVICES (autocomplete) ────────────────────────────────────
exports.searchNearby = async (req, res) => {
  try {
    const { q, latitude, longitude, radius = 10 } = req.query;
    if (!q) return res.json({ success: true, data: [] });

    const filter = {
      status: 'pending',
      $or: [
        { title:       { $regex: q, $options: 'i' } },
        { category:    { $regex: q, $options: 'i' } },
        { description: { $regex: q, $options: 'i' } },
      ],
    };

    let requests;
    if (latitude && longitude) {
      try {
        requests = await Request.find({
          ...filter,
          location: {
            $near: {
              $geometry:    { type: 'Point', coordinates: [parseFloat(longitude), parseFloat(latitude)] },
              $maxDistance: parseFloat(radius) * 1000,
            },
          },
        }).populate('user', 'name').limit(10);
      } catch (e) {
        requests = await Request.find(filter).populate('user', 'name').limit(10);
      }
    } else {
      requests = await Request.find(filter).populate('user', 'name').limit(10);
    }

    res.json({ success: true, data: requests });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET REQUEST BY ID ─────────────────────────────────────────────────────────
exports.getRequestById = async (req, res) => {
  try {
    const request = await Request.findById(req.params.id)
      .populate('user',             'name email phone profileImage')
      .populate('assignedProvider', 'name email phone profileImage')
      .populate('offers.provider',  'name email phone profileImage');

    if (!request) return res.status(404).json({ success: false, message: 'Request not found' });
    res.json({ success: true, data: request });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── MAKE OFFER ────────────────────────────────────────────────────────────────
exports.makeOffer = async (req, res) => {
  try {
    const { price, message, eta } = req.body;
    if (!price) return res.status(400).json({ success: false, message: 'Price is required' });

    const request = await Request.findById(req.params.id);
    if (!request)                    return res.status(404).json({ success: false, message: 'Request not found' });
    if (request.status !== 'pending') return res.status(400).json({ success: false, message: 'Request no longer open' });

    const already = request.offers.find(o => o.provider.toString() === req.user.id);
    if (already) return res.status(400).json({ success: false, message: 'You already made an offer' });

    request.offers.push({ provider: req.user.id, price: Number(price), message: message || '', eta: eta || '' });
    await request.save();
    await request.populate('offers.provider', 'name email phone profileImage');

    try {
      const io = req.app.get('io');
      if (io) io.to(`user_${request.user}`).emit('new-offer', { requestId: request._id });
    } catch (e) {}

    res.json({ success: true, message: 'Offer sent!', data: request });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── ACCEPT OFFER ──────────────────────────────────────────────────────────────
exports.acceptOffer = async (req, res) => {
  try {
    const { providerId } = req.body;
    const request = await Request.findById(req.params.id);
    if (!request) return res.status(404).json({ success: false, message: 'Not found' });
    if (request.user.toString() !== req.user.id) return res.status(403).json({ success: false, message: 'Not authorized' });

    request.offers.forEach(o => {
      o.status = o.provider.toString() === providerId ? 'accepted' : 'rejected';
    });
    request.status           = 'active';
    request.assignedProvider = providerId;
    await request.save();

    try {
      const io = req.app.get('io');
      if (io) io.to(`user_${providerId}`).emit('offer-accepted', { requestId: request._id, title: request.title });
    } catch (e) {}

    res.json({ success: true, message: 'Provider assigned!', data: request });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── COMPLETE JOB ──────────────────────────────────────────────────────────────
exports.completeJob = async (req, res) => {
  try {
    const request = await Request.findById(req.params.id);
    if (!request) return res.status(404).json({ success: false, message: 'Not found' });

    const isUser     = request.user.toString()              === req.user.id;
    const isProvider = request.assignedProvider?.toString() === req.user.id;
    if (!isUser && !isProvider) return res.status(403).json({ success: false, message: 'Not authorized' });

    request.status      = 'completed';
    request.completedAt = new Date();
    await request.save();

    res.json({ success: true, message: 'Job completed!', data: request });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── CANCEL REQUEST ────────────────────────────────────────────────────────────
exports.cancelRequest = async (req, res) => {
  try {
    const { reason } = req.body;
    const request = await Request.findById(req.params.id);
    if (!request) return res.status(404).json({ success: false, message: 'Not found' });
    if (request.user.toString() !== req.user.id) return res.status(403).json({ success: false, message: 'Not authorized' });
    if (['completed', 'cancelled'].includes(request.status))
      return res.status(400).json({ success: false, message: `Already ${request.status}` });

    request.status       = 'cancelled';
    request.cancelledAt  = new Date();
    request.cancelReason = reason || '';
    await request.save();

    res.json({ success: true, message: 'Cancelled', data: request });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};