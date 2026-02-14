const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  provider: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Provider',
    required: true
  },
  serviceRequest: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ServiceRequest',
    required: true
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  review: {
    type: String,
    maxlength: 500
  },
  categories: {
    professionalism: { type: Number, min: 1, max: 5 },
    quality: { type: Number, min: 1, max: 5 },
    punctuality: { type: Number, min: 1, max: 5 },
    communication: { type: Number, min: 1, max: 5 }
  },
  images: [{
    type: String
  }],
  response: {
    message: String,
    respondedAt: Date
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes
reviewSchema.index({ provider: 1, createdAt: -1 });
reviewSchema.index({ user: 1 });
reviewSchema.index({ serviceRequest: 1 }, { unique: true });
reviewSchema.index({ rating: -1 });

// Update provider rating after saving review
reviewSchema.post('save', async function() {
  const Provider = mongoose.model('Provider');
  const Review = mongoose.model('Review');
  
  const stats = await Review.aggregate([
    { $match: { provider: this.provider } },
    {
      $group: {
        _id: '$provider',
        average: { $avg: '$rating' },
        count: { $sum: 1 }
      }
    }
  ]);
  
  if (stats.length > 0) {
    await Provider.findByIdAndUpdate(this.provider, {
      'rating.average': stats[0].average.toFixed(1),
      'rating.count': stats[0].count
    });
  }
});

module.exports = mongoose.model('Review', reviewSchema);
