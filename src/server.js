// backend/src/server.js - CLEAN VERSION
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const socketIO = require('socket.io');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  transports: ['websocket', 'polling'],
});

// Middleware
app.use(cors());
app.use(express.json());
app.set('io', io);

// Health check
app.get('/', (req, res) => {
  res.json({ 
    success: true, 
    message: 'HeyMate Backend API - Running',
    timestamp: new Date().toISOString()
  });
});

// Routes - SAFE LOADING
const loadRoute = (path, route) => {
  try {
    app.use(path, require(route));
    console.log(`✅ Loaded: ${path}`);
  } catch (error) {
    console.error(`❌ Failed to load ${path}:`, error.message);
  }
};

loadRoute('/api/auth', './routes/auth');
loadRoute('/api/providers', './routes/providers');
loadRoute('/api/requests', './routes/requests');
loadRoute('/api/nearby', './routes/nearby');

// Socket.IO
io.on('connection', (socket) => {
  console.log('📱 Client connected:', socket.id);

  socket.on('join-user-room', (userId) => {
    socket.join(`user_${userId}`);
    console.log(`👤 User ${userId} joined`);
  });

  socket.on('join-provider-room', (providerId) => {
    socket.join(`provider_${providerId}`);
    console.log(`👷 Provider ${providerId} joined`);
  });

  socket.on('disconnect', () => {
    console.log('📱 Client disconnected');
  });
});

// MongoDB Connection
const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('❌ MONGO_URI not set!');
  process.exit(1);
}

mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch((err) => {
    console.error('❌ MongoDB error:', err.message);
    process.exit(1);
  });

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM - Shutting down gracefully');
  server.close(() => {
    mongoose.connection.close(false, () => {
      process.exit(0);
    });
  });
});