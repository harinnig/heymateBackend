// backend/src/models/Request.js
const mongoose = require('mongoose');

const offerSchema = new mongoose.Schema({
  provider:   { type: mongoose.Schema.Types.ObjectId, ref: 'Provider', required: true },
  price:      { type: Number, required: true },
  message:    { type: String },
  status:     { type: String, enum: ['pending','accepted','rejected'], default: 'pending' },
  createdAt:  { type: Date, default: Date.now },
});

const statusHistorySchema = new mongoose.Schema({
  status:    { type: String },
  message:   { type: String },
  timestamp: { type: Date, default: Date.now },
});

const requestSchema = new mongoose.Schema({
  user:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title:       { type: String, required: true },
  description: { type: String, required: true },
  category:    { type: String, required: true },
  budget:      { type: Number, default: 0 },
  images:      [String],

  status: {
    type:    String,
    enum:    ['pending','assigned','payment_pending','active','completed','cancelled'],
    default: 'pending',
  },

  location: {
    type:        { type: String, default: 'Point' },
    coordinates: { type: [Number], default: [0, 0] },
    address:     { type: String, default: '' },
  },

  offers:           { type: [offerSchema], default: [] },
  acceptedOffer:    { type: mongoose.Schema.Types.ObjectId },
  assignedProvider: { type: mongoose.Schema.Types.ObjectId, ref: 'Provider' },

  paymentStatus: { type: String, enum: ['unpaid','paid','refunded'], default: 'unpaid' },
  paymentId:     { type: String },
  finalAmount:   { type: Number, default: 0 },

  rejectedBy:        { type: [mongoose.Schema.Types.ObjectId], default: [] },
  notifiedProviders: { type: [mongoose.Schema.Types.ObjectId], default: [] },

  // ── Default empty array prevents "push of undefined" ──
  statusHistory: { type: [statusHistorySchema], default: [] },

  completedAt: { type: Date },

}, { timestamps: true });

requestSchema.index({ location: '2dsphere' });
requestSchema.index({ user: 1, status: 1 });
requestSchema.index({ assignedProvider: 1, status: 1 });

module.exports = mongoose.models.Request || mongoose.model('Request', requestSchema);