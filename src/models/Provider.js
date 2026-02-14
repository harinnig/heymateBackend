// backend/src/models/Provider.js
const mongoose = require('mongoose');

const providerSchema = new mongoose.Schema({
  user: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'User',
    required: true,
    unique:   true,
  },
  category: {
    type:     String,
    required: true,
    enum: ['Plumbing','Electrical','Cleaning','Painting','Carpentry',
           'AC Repair','Car Wash','Moving','Salon','Pet Care','Tutoring',
           'Food Delivery','Other'],
  },
  categories: [{ type: String }],   // multiple categories
  bio:         { type: String, default: '' },
  experience:  { type: Number, default: 0 },  // years
  basePrice:   { type: Number, default: 0 },
  skills:      [{ type: String }],
  isAvailable: { type: Boolean, default: true },
  isVerified:  { type: Boolean, default: false },
  rating: {
    average: { type: Number, default: 0 },
    count:   { type: Number, default: 0 },
  },
  completedJobs: { type: Number, default: 0 },
  location: {
    type: {
      type:    String,
      enum:    ['Point'],
      default: 'Point',
    },
    coordinates: { type: [Number], default: [0, 0] },
    address:     { type: String, default: '' },
  },
  images: [{ type: String }],
}, { timestamps: true });

providerSchema.index({ location: '2dsphere' });
providerSchema.index({ category: 1, isAvailable: 1 });

module.exports = mongoose.model('Provider', providerSchema);