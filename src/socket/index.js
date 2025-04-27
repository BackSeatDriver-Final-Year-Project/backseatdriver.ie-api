const configureSocket = require('../config/socket');
const { lastJourneyData, subscribedClients } = require('./journeyTracker');
const { initializeJourneyData, handleObdData, handleDisconnect, handleSubscription } = require('./handlers');

const setupSocketIO = (server) => {
    const io = configureSocket(server);

    io.on('connection', (socket) => {
        console.log('A client connected:', socket.id);

        // Initialize journey data
        lastJourneyData[socket.id] = initializeJourneyData(socket.id);

        socket.on('subscribeToVin', (vin) => {
            handleSubscription(vin, socket, subscribedClients);
        });

        socket.on('obdData', (data) => {
            handleObdData(data, socket, lastJourneyData, subscribedClients);
        });

        socket.on('disconnect', () => {
            handleDisconnect(socket, lastJourneyData, subscribedClients);
        });
    });

    return io;
};

module.exports = setupSocketIO;