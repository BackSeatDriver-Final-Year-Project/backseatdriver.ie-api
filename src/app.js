const express = require('express');
const cors = require('cors');
const routes = require('./routes');

// Create Express app
const app = express();

// Configure CORS
app.use(cors({
    origin: '*', // Allow any origin
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/', routes);

module.exports = app;