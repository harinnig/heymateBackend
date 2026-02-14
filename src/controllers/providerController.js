// backend/src/controllers/providerController.js
const Provider = require('../models/Provider');
const User     = require('../models/User');

// ── REGISTER AS PROVIDER ──────────────────────────────────────────────────────
exports.registerProvider = async (req, res) => {
  try {
    const { category, categories, bio, experience, basePrice, skills, latitude, longitude, address } = req.body;

    if (!category) return res.status(400).json({ success: false, message: 'Category is required' });

    const existing = await Provider.findOne({ user: req.user.id });
    if (existing) return res.status(400).json({ success: false, message: 'Already registered as provider' });

    const provider = await Provider.create({
      user:       req.user.id,
      category,
      categories: categories || [category],
      bio:        bio || '',
      experience: experience || 0,
      basePrice:  basePrice || 0,
      skills:     skills || [],
      location: {
        type:        'Point',
        coordinates: [parseFloat(longitude) || 0, parseFloat(latitude) || 0],
        address:     address || '',
      },
    });

    // Update user role to provider
    await User.findByIdAndUpdate(req.user.id, { role: 'provider' });

    await provider.populate('user', 'name email phone profileImage');

    res.status(201).json({ success: true, message: 'You are now a provider!', data: provider });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET NEARBY PROVIDERS ──────────────────────────────────────────────────────
exports.getNearbyProviders = async (req, res) => {
  try {
    const { latitude, longitude, radius = 20, category } = req.query;

    const filter = { isAvailable: true };
    if (category) filter.category = category;

    let providers;

    if (latitude && longitude) {
      try {
        providers = await Provider.find({
          ...filter,
          location: {
            $near: {
              $geometry:    { type: 'Point', coordinates: [parseFloat(longitude), parseFloat(latitude)] },
              $maxDistance: parseFloat(radius) * 1000,
            },
          },
        })
          .populate('user', 'name email phone profileImage')
          .limit(30);
      } catch (geoErr) {
        providers = await Provider.find(filter)
          .populate('user', 'name email phone profileImage')
          .limit(30);
      }
    } else {
      providers = await Provider.find(filter)
        .populate('user', 'name email phone profileImage')
        .sort({ 'rating.average': -1 })
        .limit(30);
    }

    res.json({ success: true, count: providers.length, data: providers });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET PROVIDER PROFILE ──────────────────────────────────────────────────────
exports.getProviderProfile = async (req, res) => {
  try {
    const provider = await Provider.findOne({ user: req.params.userId })
      .populate('user', 'name email phone profileImage');

    if (!provider) return res.status(404).json({ success: false, message: 'Provider not found' });

    res.json({ success: true, data: provider });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET MY PROVIDER PROFILE ───────────────────────────────────────────────────
exports.getMyProfile = async (req, res) => {
  try {
    const provider = await Provider.findOne({ user: req.user.id })
      .populate('user', 'name email phone profileImage');

    if (!provider) return res.status(404).json({ success: false, message: 'Not registered as provider' });

    res.json({ success: true, data: provider });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── UPDATE PROVIDER PROFILE ───────────────────────────────────────────────────
exports.updateProfile = async (req, res) => {
  try {
    const { bio, experience, basePrice, skills, categories, latitude, longitude, address } = req.body;
    const updates = {};
    if (bio        !== undefined) updates.bio        = bio;
    if (experience !== undefined) updates.experience = experience;
    if (basePrice  !== undefined) updates.basePrice  = basePrice;
    if (skills     !== undefined) updates.skills     = skills;
    if (categories !== undefined) updates.categories = categories;
    if (latitude && longitude) {
      updates.location = { type: 'Point', coordinates: [parseFloat(longitude), parseFloat(latitude)], address: address || '' };
    }

    const provider = await Provider.findOneAndUpdate(
      { user: req.user.id }, updates, { new: true }
    ).populate('user', 'name email phone profileImage');

    res.json({ success: true, data: provider });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── TOGGLE AVAILABILITY ───────────────────────────────────────────────────────
exports.toggleAvailability = async (req, res) => {
  try {
    const { isAvailable } = req.body;
    const provider = await Provider.findOneAndUpdate(
      { user: req.user.id },
      { isAvailable },
      { new: true }
    );
    res.json({ success: true, data: { isAvailable: provider.isAvailable } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};