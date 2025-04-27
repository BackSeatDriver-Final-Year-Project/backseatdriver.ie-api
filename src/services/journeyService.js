const db = require('../config/db');
const cacheService = require('./cacheService');

// Get journeys for a specific vehicle
const getJourneys = (vehicleId) => {
    return new Promise((resolve, reject) => {
        // Check if the specific vehicle data is in the cache
        const cachedData = cacheService.get(`journey_${vehicleId}`);
        if (cachedData) {
            return resolve(cachedData);
        }

        // Query the database for the specific vehicle for the authenticated user
        const query = 'SELECT journey_id, VID, journey_start_time, journey_commence_time, journey_dataset, fuel_usage_dataset, TIMEDIFF(journey_commence_time, journey_start_time) AS journeyDuration FROM journeys WHERE VID = ? ORDER BY journey_commence_time DESC;';
        db.query(query, [vehicleId], (err, results) => {
            if (err) {
                return reject(err);
            }

            if (results.length === 0) {
                return resolve([{}]);
            }

            // Store the results in cache for faster future access
            cacheService.set(`journey_${vehicleId}`, results);
            resolve(results);
        });
    });
};

module.exports = {
    getJourneys
};