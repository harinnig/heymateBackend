// backend/src/server.js
const express    = require('express');
const mongoose   = require('mongoose');
const cors       = require('cors');
const helmet     = require('helmet');
const morgan     = require('morgan');
const http       = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

const app    = express();
const server = http.createServer(app);

// ── Socket.IO ─────────────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'] },
});
app.set('io', io);

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({ origin: '*', methods: ['GET','POST','PUT','DELETE','PATCH','OPTIONS'], allowedHeaders: ['Content-Type','Authorization'] }));
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── MongoDB ───────────────────────────────────────────────────────────────────
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/heymate';
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB error:', err.message));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth',      require('./routes/auth'));
app.use('/api/providers', require('./routes/providers'));
app.use('/api/requests',  require('./routes/requests'));
app.use('/api/reviews',   require('./routes/reviews'));
app.use('/api/payments',  require('./routes/payments'));
app.use('/api/nearby',    require('./routes/nearby'));

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/',           (req, res) => res.json({ message: '✅ HeyMate API Running', version: '2.0.0' }));
app.get('/api/health', (req, res) => res.json({
  status:   'healthy',
  database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  time:     new Date().toISOString(),
}));

// ── 404 & Error ───────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` }));
app.use((err, req, res, next) => {
  console.error('🔴 Error:', err.message);
  res.status(err.status || 500).json({ success: false, message: err.message || 'Internal server error' });
});

// ── Socket.IO Events ──────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log('🔌 Connected:', socket.id);

  // User joins their personal room
  socket.on('join-user-room', (userId) => {
    socket.join(`user_${userId}`);
    console.log(`👤 User ${userId} joined their room`);
  });

  // Provider joins their personal room
  socket.on('join-provider-room', (providerId) => {
    socket.join(`provider_${providerId}`);
    console.log(`👷 Provider ${providerId} joined their room`);
  });

  // Provider joins general providers room
  socket.on('join-providers', () => {
    socket.join('providers');
  });

  // Location update
  socket.on('update-location', (data) => {
    socket.to(`user_${data.userId}`).emit('provider-location', data);
  });

  // Typing indicator
  socket.on('typing', (data) => {
    socket.to(`user_${data.toUserId}`).emit('user-typing', data);
  });

  socket.on('disconnect', () => {
    console.log('🔌 Disconnected:', socket.id);
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 HeyMate Server running on port ${PORT}`);
});

module.exports = { app, server };