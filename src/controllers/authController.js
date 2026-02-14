// backend/src/controllers/authController.js
const User = require('../models/User');
const jwt  = require('jsonwebtoken');

const JWT_SECRET  = process.env.JWT_SECRET || 'heymate_secret_key_2024_secure';
const generateToken = (id, role) =>
  jwt.sign({ id, role }, JWT_SECRET, { expiresIn: '30d' });

// ── REGISTER ──────────────────────────────────────────────────────────────────
exports.register = async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    // Validate
    if (!name)     return res.status(400).json({ success: false, message: 'Name is required' });
    if (!email)    return res.status(400).json({ success: false, message: 'Email is required' });
    if (!phone)    return res.status(400).json({ success: false, message: 'Phone is required' });
    if (!password) return res.status(400).json({ success: false, message: 'Password is required' });
    if (password.length < 6) return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });

    // Check existing
    const emailExists = await User.findOne({ email: email.toLowerCase().trim() });
    if (emailExists) return res.status(400).json({ success: false, message: 'This email is already registered. Please login instead.' });

    const phoneExists = await User.findOne({ phone: phone.trim() });
    if (phoneExists) return res.status(400).json({ success: false, message: 'This phone number is already registered.' });

    // Create user
    const user = await User.create({
      name:     name.trim(),
      email:    email.toLowerCase().trim(),
      phone:    phone.trim(),
      password,
      role:     'user',
    });

    const token    = generateToken(user._id, user.role);
    const userData = {
      _id:          user._id,
      name:         user.name,
      email:        user.email,
      phone:        user.phone,
      role:         user.role,
      profileImage: user.profileImage || null,
      address:      user.address || {},
    };

    console.log('✅ New user registered:', user.email);
    res.status(201).json({ success: true, token, data: userData });

  } catch (error) {
    console.error('Register error:', error.message);
    if (error.code === 11000) {
      const field = Object.keys(error.keyValue || {})[0] || 'field';
      return res.status(400).json({ success: false, message: `${field} already exists. Try logging in.` });
    }
    res.status(500).json({ success: false, message: 'Server error: ' + error.message });
  }
};

// ── LOGIN ─────────────────────────────────────────────────────────────────────
exports.login = async (req, res) => {
  try {
    const { email, phone, password } = req.body;

    if (!password) return res.status(400).json({ success: false, message: 'Password is required' });
    if (!email && !phone) return res.status(400).json({ success: false, message: 'Email or phone number is required' });

    // Find user
    let user;
    if (email) {
      user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password');
      if (!user) return res.status(401).json({ success: false, message: `No account found with email: ${email}. Please register first.` });
    } else {
      user = await User.findOne({ phone: phone.trim() }).select('+password');
      if (!user) return res.status(401).json({ success: false, message: `No account found with phone: ${phone}. Please register first.` });
    }

    // Check password
    const isMatch = await user.matchPassword(password);
    if (!isMatch) return res.status(401).json({ success: false, message: 'Incorrect password. Please try again.' });

    const token    = generateToken(user._id, user.role);
    const userData = {
      _id:          user._id,
      name:         user.name,
      email:        user.email,
      phone:        user.phone,
      role:         user.role,
      profileImage: user.profileImage || null,
      address:      user.address || {},
    };

    console.log('✅ User logged in:', user.email);
    res.json({ success: true, token, data: userData });

  } catch (error) {
    console.error('Login error:', error.message);
    res.status(500).json({ success: false, message: 'Server error: ' + error.message });
  }
};

// ── GET PROFILE ───────────────────────────────────────────────────────────────
exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── UPDATE PROFILE ────────────────────────────────────────────────────────────
exports.updateProfile = async (req, res) => {
  try {
    const allowed = ['name', 'phone', 'address', 'profileImage'];
    const updates = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });

    const user = await User.findByIdAndUpdate(req.user.id, updates, { new: true, runValidators: true });
    res.json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};