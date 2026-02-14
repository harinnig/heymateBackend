// backend/src/routes/requests.js
const express = require('express');
const router  = express.Router();
const { protect } = require('../middleware/auth');
const {
  createRequest, getMyRequests, getNearbyRequests,
  searchNearby, getRequestById, makeOffer,
  acceptOffer, completeJob, cancelRequest,
} = require('../controllers/requestController');

router.post('/',                 protect, createRequest);
router.get('/my-requests',       protect, getMyRequests);
router.get('/nearby',            protect, getNearbyRequests);
router.get('/search',            protect, searchNearby);
router.get('/provider-requests', protect, getNearbyRequests);
router.get('/:id',               protect, getRequestById);
router.post('/:id/offer',        protect, makeOffer);
router.post('/:id/accept-offer', protect, acceptOffer);
router.put('/:id/complete',      protect, completeJob);
router.put('/:id/cancel',        protect, cancelRequest);

module.exports = router;