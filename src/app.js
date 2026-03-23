const path = require('path');
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const routes = require('./routes');
const errorMiddleware = require('./middleware/error.middleware');

const app = express();

const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173,http://localhost:5175').split(',').map(o => o.trim());
const isDev = process.env.NODE_ENV === 'development';
app.use(cors({
  origin: (origin, cb) => {
    // In development allow any localhost origin (Vite can pick any free port)
    if (!origin || (isDev && /^http:\/\/localhost:\d+$/.test(origin))) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

app.use('/api/v1', routes);

// Serve uploaded files (PDFs, images) as static assets
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.get('/health', (req, res) => res.json({ status: 'OK', timestamp: new Date() }));

app.use(errorMiddleware);

module.exports = app;
