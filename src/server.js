const http = require('http');
const app = require('./app');
const setupSocketIO = require('./socket');
const { port } = require('./config/env');

// Create HTTP server
const server = http.createServer(app);

// Setup Socket.IO
const io = setupSocketIO(server);

// Start server
server.listen(port, () => {
    console.log(`Server running on port ${port}`);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    server.close(() => {
        console.log('HTTP server closed');
    });
});