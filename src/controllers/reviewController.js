const Review = require('../models/Review');
const ServiceRequest = require('../models/ServiceRequest');
const Provider = require('../models/Provider');

// @desc    Create review
// @route   POST /api/reviews
// @access  Private (User)
exports.createReview = async (req, res) => {
  try {
    const {
      providerId,
      serviceRequestId,
      rating,
      review,
      categories,
      images
    } = req.body;

    // Check if service request exists and is completed
    const serviceRequest = await ServiceRequest.findById(serviceRequestId);

    if (!serviceRequest) {
      return res.status(404).json({
        success: false,
        message: 'Service request not found'
      });
    }

    if (serviceRequest.user.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to review this service'
      });
    }

    if (serviceRequest.status !== 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Can only review completed services'
      });
    }

    // Check if review already exists
    const existingReview = await Review.findOne({ serviceRequest: serviceRequestId });

    if (existingReview) {
      return res.status(400).json({
        success: false,
        message: 'You have already reviewed this service'
      });
    }

    // Create review
    const newReview = await Review.create({
      user: req.user.id,
      provider: providerId,
      serviceRequest: serviceRequestId,
      rating,
      review,
      categories,
      images
    });

    const populatedReview = await Review.findById(newReview._id)
      .populate('user', 'name profileImage');

    res.status(201).json({
      success: true,
      message: 'Review submitted successfully',
      data: populatedReview
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error creating review',
      error: error.message
    });
  }
};

// @desc    Get provider reviews
// @route   GET /api/reviews/provider/:providerId
// @access  Public
exports.getProviderReviews = async (req, res) => {
  try {
    const { page = 1, limit = 10, rating } = req.query;

    const query = { provider: req.params.providerId };
    if (rating) query.rating = parseInt(rating);

    const reviews = await Review.find(query)
      .populate('user', 'name profileImage')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const count = await Review.countDocuments(query);

    // Get rating distribution
    const ratingStats = await Review.aggregate([
      { $match: { provider: mongoose.Types.ObjectId(req.params.providerId) } },
      {
        $group: {
          _id: '$rating',
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: -1 } }
    ]);

    res.status(200).json({
      success: true,
      count,
      totalPages: Math.ceil(count / limit),
      currentPage: parseInt(page),
      ratingDistribution: ratingStats,
      data: reviews
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching reviews',
      error: error.message
    });
  }
};

// @desc    Get user's reviews
// @route   GET /api/reviews/my-reviews
// @access  Private
exports.getUserReviews = async (req, res) => {
  try {
    const reviews = await Review.find({ user: req.user.id })
      .populate('provider', 'businessName rating')
      .populate('serviceRequest', 'title serviceType')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: reviews.length,
      data: reviews
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching reviews',
      error: error.message
    });
  }
};

// @desc    Provider responds to review
// @route   PUT /api/reviews/:id/respond
// @access  Private (Provider)
exports.respondToReview = async (req, res) => {
  try {
    const { message } = req.body;

    const provider = await Provider.findOne({ user: req.user.id });
    const review = await Review.findById(req.params.id);

    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found'
      });
    }

    if (review.provider.toString() !== provider._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized'
      });
    }

    review.response = {
      message,
      respondedAt: new Date()
    };

    await review.save();

    res.status(200).json({
      success: true,
      message: 'Response added successfully',
      data: review
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error responding to review',
      error: error.message
    });
  }
};
