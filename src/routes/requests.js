// backend/src/routes/requests.js
const express = require('express');
const router  = express.Router();
const {
  createRequest, getMyRequests, getProviderRequests,
  makeOffer, acceptOffer, rejectRequest,
  confirmPayment, markCompleted,
  getRequestById, cancelRequest, searchRequests,
} = require('../controllers/requestController');
const { protect } = require('../middleware/auth');

router.get('/search',            protect, searchRequests);
router.get('/my-requests',       protect, getMyRequests);
router.get('/provider-requests', protect, getProviderRequests);
router.get('/:id',               protect, getRequestById);
router.post('/',                 protect, createRequest);
router.post('/:id/offer',        protect, makeOffer);
router.post('/:id/accept-offer', protect, acceptOffer);
router.post('/:id/reject',       protect, rejectRequest);
router.post('/:id/payment',      protect, confirmPayment);
router.put('/:id/complete',      protect, markCompleted);
router.put('/:id/cancel',        protect, cancelRequest);

module.exports = router;