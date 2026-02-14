// backend/src/models/Request.js
const mongoose = require('mongoose');

const offerSchema = new mongoose.Schema({
  provider:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  price:       { type: Number, required: true },
  message:     { type: String, default: '' },
  eta:         { type: String, default: '' },   // e.g. "30 mins"
  status:      { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
  createdAt:   { type: Date, default: Date.now },
});

const requestSchema = new mongoose.Schema({
  user: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'User',
    required: true,
  },
  title: {
    type:     String,
    required: [true, 'Title is required'],
    trim:     true,
  },
  description: {
    type:    String,
    default: '',
  },
  category: {
    type:     String,
    required: [true, 'Category is required'],
    enum: [
      'Plumbing', 'Electrical', 'Cleaning', 'Painting',
      'Carpentry', 'AC Repair', 'Car Wash', 'Moving',
      'Salon', 'Pet Care', 'Tutoring', 'Food Delivery', 'Other',
    ],
  },
  budget: {
    type:    Number,
    default: null,
  },
  status: {
    type:    String,
    enum:    ['pending', 'active', 'completed', 'cancelled'],
    default: 'pending',
  },

  // ── Location ────────────────────────────────────────────────────────────────
  location: {
    type: {
      type:    String,
      enum:    ['Point'],
      default: 'Point',
    },
    coordinates: {
      type:    [Number],   // [longitude, latitude]
      default: [0, 0],
    },
    address: { type: String, default: '' },
  },

  // ── Assigned provider (after offer accepted) ────────────────────────────────
  assignedProvider: {
    type:    mongoose.Schema.Types.ObjectId,
    ref:     'User',
    default: null,
  },

  // ── Offers from providers ───────────────────────────────────────────────────
  offers: [offerSchema],

  // ── Search radius in km ─────────────────────────────────────────────────────
  searchRadius: {
    type:    Number,
    default: 10,  // 10km
  },

  completedAt: { type: Date, default: null },
  cancelledAt: { type: Date, default: null },
  cancelReason:{ type: String, default: '' },

}, { timestamps: true });

// Geo index for nearby queries
requestSchema.index({ location: '2dsphere' });
requestSchema.index({ user: 1, status: 1 });

module.exports = mongoose.model('Request', requestSchema);