const db = require('../config/db');

// Initialize journey data store for a socket
const initializeJourneyData = (socketId) => {
    return {
        vin: null, // To be set on first OBD data received
        journey_start_time: null, // To be updated dynamically
        journey_commence_time: null, // Set on disconnect
        journey_dataset: [],
        speed_dataset: [],
        fuel_usage_dataset: [],
        last_obd_message: null
    };
};

// Handle OBD data from a client
const handleObdData = (data, socket, lastJourneyData, subscribedClients) => {
    const { vin, vehicleSpeed, fuelLevel } = data;

    if (!lastJourneyData[socket.id].vin) {
        lastJourneyData[socket.id].vin = vin;  // Assign VIN on first OBD message
    }

    // If journey_start_time is null, set it to the first received OBD data time
    if (!lastJourneyData[socket.id].journey_start_time) {
        const now = new Date();
        const formattedDate = now.toISOString().slice(0, 19).replace('T', ' ');
        lastJourneyData[socket.id].journey_start_time = formattedDate;
    }

    // Store OBD Data
    lastJourneyData[socket.id].journey_dataset = data;
    lastJourneyData[socket.id].speed_dataset.push({ time: new Date().toISOString(), speed: vehicleSpeed });
    lastJourneyData[socket.id].fuel_usage_dataset.push({ time: new Date().toISOString(), fuelLevel });
    lastJourneyData[socket.id].last_obd_message = data;

    // Notify all clients subscribed to this VIN
    if (subscribedClients[vin]) {
        subscribedClients[vin].forEach(clientSocket => {
            clientSocket.emit('updateObdData', data);
        });
    }
};

// Handle client disconnect and save journey data
const handleDisconnect = (socket, lastJourneyData, subscribedClients) => {
    console.log('A client disconnected:', socket.id);

    if (lastJourneyData[socket.id]) {
        const { vin, journey_start_time, journey_dataset, speed_dataset, fuel_usage_dataset } = lastJourneyData[socket.id];

        if (!vin || !journey_start_time) {
            console.warn('No valid journey data recorded, skipping database insert.');
            return;
        }

        // Set the actual end time when the client disconnects
        const now = new Date();
        const journey_end_time = now.toISOString().slice(0, 19).replace('T', ' ');

        console.log({
            vin,
            journey_start_time,
            journey_end_time
        });

        const findVidQuery = `
            SELECT unique_id
            FROM registered_vehicles
            WHERE VID = ?
        `;

        db.query(findVidQuery, [vin], (err, result) => {
            if (err) {
                console.error('Error finding VID:', err);
                return;
            }

            if (result.length === 0) {
                console.log('No matching VID found for VIN:', vin);
                return;
            }

            // Get the VID (unique_id)
            const vid = result[0].unique_id;
            
            // Save the journey data
            const journeyQuery = `
                INSERT INTO journeys (VID, journey_start_time, journey_commence_time, journey_dataset, speed_dataset, fuel_usage_dataset) 
                VALUES (?, ?, ?, ?, ?, ?)
            `;

            db.query(journeyQuery, [
                vid,
                journey_start_time,
                journey_end_time,
                JSON.stringify(journey_dataset),
                JSON.stringify(speed_dataset),
                JSON.stringify(fuel_usage_dataset)
            ], (err, result) => {
                if (err) {
                    console.error('Error saving journey data:', err);
                } else {
                    console.log('Journey data saved successfully');
                }
            });
        });

        // Clean up memory
        delete lastJourneyData[socket.id];
    }

    if (socket.vin && subscribedClients[socket.vin]) {
        subscribedClients[socket.vin] = subscribedClients[socket.vin].filter(client => client.id !== socket.id);
        if (subscribedClients[socket.vin].length === 0) {
            delete subscribedClients[socket.vin];
        }
    }
};

// Handle client subscription to a VIN
const handleSubscription = (vin, socket, subscribedClients) => {
    socket.vin = vin;
    if (!subscribedClients[vin]) {
        subscribedClients[vin] = [];
    }
    subscribedClients[vin].push(socket);
    console.log(`Client subscribed to VIN: ${vin}`);
};

module.exports = {
    initializeJourneyData,
    handleObdData,
    handleDisconnect,
    handleSubscription
};