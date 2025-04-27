const socketIo = require('socket.io');

const configureSocket = (server) => {
    const io = socketIo(server, {
        cors: {
            origin: "*", // Allow all origins for testing
        }
    });
    
    return io;
};

module.exports = configureSocket;