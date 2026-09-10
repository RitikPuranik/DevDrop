
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { errorHandler } from './middleware/errorHandler';
import { apiRateLimiter } from './middleware/rateLimiter';
import { ensureJsonResponse } from './middleware/jsonResponse';
import { startJobProcessor } from '../jobs/SimpleJobProcessor';

// Import routes
import onboardRouter from './routes/onboard';
import generateRouter from './routes/generate';
import reviewRouter from './routes/review';
import enhanceRouter from './routes/enhance';
import statusRouter from './routes/status';
import projectsRouter from './routes/projects';
import historyRouter from './routes/history';
import settingsRouter from './routes/settings';
import previewRouter from './routes/preview';
import chatRouter from './routes/chat';
import chatHistoryRouter from './routes/chatHistory';
import downloadRouter from './routes/download';
import deployRouter from './routes/deploy';
import fixPreviewErrorsRouter from '../routes/fix-preview-errors';
import cacheRouter from './cache';
import jobsRouter from './routes/jobs-simple';
import generationsRouter from './routes/generations';
import imageGenerationRouter from '../routes/imageGeneration';
import githubRouter from './routes/github';
// import codebaseRouter from './routes/codebase'; // DISABLED - rollback to legacy mode

const app = express();

// Trust proxy - MUST be set before any middleware
// This is required when running behind a reverse proxy (Heroku, nginx, etc.)
app.set('trust proxy', 1);

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
  },
});

// CORS Configuration
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://genie-ai.vercel.app',
  'https://genieai.vercel.app',
];

// Add environment variable origin if specified
if (process.env.FRONTEND_URL) {
  allowedOrigins.push(process.env.FRONTEND_URL);
}

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, Postman, curl)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.warn(`⚠️  CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'x-github-token'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 86400, // 24 hours
}));

// Middleware
app.use(express.json());
app.use(ensureJsonResponse); // Ensure all responses are JSON
app.use('/api', apiRateLimiter);

// Routes
app.use('/api', onboardRouter);
app.use('/api', generateRouter);
app.use('/api', reviewRouter);
app.use('/api', enhanceRouter);
app.use('/api', statusRouter);
app.use('/api', projectsRouter);
app.use('/api', historyRouter);
app.use('/api', settingsRouter);
app.use('/api', previewRouter);
app.use('/api', chatRouter);
app.use('/api', chatHistoryRouter);
app.use('/api', downloadRouter);
app.use('/api', deployRouter);
app.use('/api/fix-preview-errors', fixPreviewErrorsRouter);
app.use('/api/cache', cacheRouter);
app.use('/api/jobs', jobsRouter);
app.use('/api/generations', generationsRouter);
app.use('/api/images', imageGenerationRouter);
app.use('/api/github', githubRouter);
// app.use('/api', codebaseRouter); // DISABLED - rollback to legacy mode

// Socket.io connection
io.on('connection', (socket) => {
  console.log('✅ User connected:', socket.id);
  
  // Join user-specific room
  socket.on('join:user', (userId: string) => {
    socket.join(`user:${userId}`);
    console.log(`👤 User ${userId} joined their room`);
  });
  
  // Join session-specific room
  socket.on('join:session', (sessionId: string) => {
    socket.join(`session:${sessionId}`);
    console.log(`📝 Session ${sessionId} room joined`);
  });
  
  socket.on('disconnect', () => {
    console.log('❌ User disconnected:', socket.id);
  });
});

// Start simple job processor (polls database every 2 seconds)
startJobProcessor();

// Error Handler Middleware
app.use(errorHandler);

export { server, app, io };
