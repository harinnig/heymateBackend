const jwt = require('jsonwebtoken');
const User = require('../models/User');
const ServiceRequest = require('../models/ServiceRequest');
const Provider = require('../models/Provider');

module.exports = (io) => {
  // Middleware for socket authentication
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      
      if (!token) {
        return next(new Error('Authentication error'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id);

      if (!user) {
        return next(new Error('User not found'));
      }

      socket.userId = user._id.toString();
      socket.userRole = user.role;
      next();
    } catch (error) {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.userId}`);

    // Join user's personal room
    socket.join(socket.userId);

    // Handle location updates from providers
    socket.on('update-location', async (data) => {
      try {
        const { latitude, longitude, requestId } = data;

        if (socket.userRole === 'provider') {
          // Update provider's location
          await Provider.findOneAndUpdate(
            { user: socket.userId },
            {
              currentLocation: {
                type: 'Point',
                coordinates: [longitude, latitude],
                lastUpdated: new Date()
              }
            }
          );

          // If there's an active request, update it and notify user
          if (requestId) {
            const request = await ServiceRequest.findById(requestId);
            if (request && request.status === 'in_progress') {
              request.providerLocation = {
                type: 'Point',
                coordinates: [longitude, latitude],
                lastUpdated: new Date()
              };
              await request.save();

              // Send location to user
              io.to(request.user.toString()).emit('provider-location-update', {
                requestId,
                location: { latitude, longitude }
              });
            }
          }
        }
      } catch (error) {
        console.error('Error updating location:', error);
        socket.emit('error', { message: 'Failed to update location' });
      }
    });

    // Handle chat messages
    socket.on('send-message', async (data) => {
      try {
        const { requestId, message } = data;

        const request = await ServiceRequest.findById(requestId);
        
        if (!request) {
          socket.emit('error', { message: 'Request not found' });
          return;
        }

        // Add message to request
        request.chat.push({
          sender: socket.userId,
          message,
          timestamp: new Date()
        });
        await request.save();

        // Determine recipient
        const recipientId = socket.userId === request.user.toString() 
          ? request.provider.toString() 
          : request.user.toString();

        // Send message to recipient
        io.to(recipientId).emit('new-message', {
          requestId,
          sender: socket.userId,
          message,
          timestamp: new Date()
        });

        // Confirm to sender
        socket.emit('message-sent', {
          requestId,
          message,
          timestamp: new Date()
        });
      } catch (error) {
        console.error('Error sending message:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Notify nearby providers about new requests
    socket.on('broadcast-request', async (data) => {
      try {
        const { requestId, serviceType, location, radius = 10000 } = data;

        // Find nearby available providers
        const providers = await Provider.find({
          services: serviceType,
          'availability.isAvailable': true,
          isApproved: true,
          currentLocation: {
            $near: {
              $geometry: {
                type: 'Point',
                coordinates: location
              },
              $maxDistance: radius
            }
          }
        }).populate('user');

        // Notify each provider
        providers.forEach(provider => {
          io.to(provider.user._id.toString()).emit('new-request-nearby', {
            requestId,
            serviceType,
            distance: 'nearby'
          });
        });
      } catch (error) {
        console.error('Error broadcasting request:', error);
      }
    });

    // Handle typing indicators
    socket.on('typing', (data) => {
      const { requestId, recipientId } = data;
      io.to(recipientId).emit('user-typing', {
        requestId,
        userId: socket.userId
      });
    });

    socket.on('stop-typing', (data) => {
      const { requestId, recipientId } = data;
      io.to(recipientId).emit('user-stop-typing', {
        requestId,
        userId: socket.userId
      });
    });

    // Handle provider availability status
    socket.on('update-availability', async (data) => {
      try {
        const { isAvailable } = data;
        
        if (socket.userRole === 'provider') {
          await Provider.findOneAndUpdate(
            { user: socket.userId },
            { 'availability.isAvailable': isAvailable }
          );

          socket.emit('availability-updated', { isAvailable });
        }
      } catch (error) {
        socket.emit('error', { message: 'Failed to update availability' });
      }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.userId}`);
      socket.leave(socket.userId);
    });
  });
};
