const db = require('../config/db');
const cacheService = require('./cacheService');

// Get all vehicles for a user
const getVehicles = (userId) => {
    return new Promise((resolve, reject) => {
        // Check if the data is in the cache
        const cachedData = cacheService.get(`vehicles_${userId}`);
        if (cachedData) {
            return resolve(cachedData);
        }

        // If not in the cache, query the database
        const query = 'SELECT * FROM registered_vehicles WHERE FK = ?';
        db.query(query, [userId], (err, results) => {
            if (err) {
                return reject(err);
            }

            // Store the results in cache
            cacheService.set(`vehicles_${userId}`, results);
            resolve(results);
        });
    });
};

// Get a specific vehicle by ID
const getVehicleById = (userId, vehicleId) => {
    return new Promise((resolve, reject) => {
        // Check if the specific vehicle data is in the cache
        const cachedData = cacheService.get(`vehicle_${userId}_${vehicleId}`);
        if (cachedData) {
            return resolve(cachedData);
        }

        // Query the database for the specific vehicle for the authenticated user
        const query = 'SELECT * FROM registered_vehicles WHERE FK = ? AND unique_id = ?';
        db.query(query, [userId, vehicleId], (err, results) => {
            if (err) {
                return reject(err);
            }

            if (results.length === 0) {
                return resolve(null);
            }

            // Store the results in cache for faster future access
            cacheService.set(`vehicle_${userId}_${vehicleId}`, results[0]);
            resolve(results[0]);
        });
    });
};

// Register a new vehicle
const registerVehicle = (userId, name, VID) => {
    return new Promise((resolve, reject) => {
        const query = 'INSERT INTO registered_vehicles (unique_id, name, VID) VALUES (?, ?, ?)';
        const values = [userId, name, VID || null];

        db.query(query, values, (err, result) => {
            if (err) {
                return reject(err);
            }
            resolve(result);
        });
    });
};

// Update vehicle location
const updateLocation = (VID, latitude, longitude) => {
    return new Promise((resolve, reject) => {
        const query = 'UPDATE registered_vehicles SET location_lat = ?, location_long = ? WHERE VID = ?';

        db.query(query, [latitude, longitude, VID], (err, result) => {
            if (err) {
                return reject(err);
            }
            resolve(result);
        });
    });
};

// Update device status
const updateDeviceStatus = (vid, device_charging_level, device_charging_status, connected_device_name) => {
    return new Promise((resolve, reject) => {
        const sql = `UPDATE registered_vehicles SET device_charging_level = ?, device_charging_status = ?, connected_device_name = ? WHERE vid = ?`;

        db.query(sql, [device_charging_level, device_charging_status, connected_device_name, vid], (err, result) => {
            if (err) {
                return reject(err);
            }
            resolve(result);
        });
    });
};

// Get vehicle summary
const getVehicleSummary = async (vid) => {
    try {
        const [
            [calendarHeatmap],
            [totalJourneys],
            [averageDuration],
            [activeDays],
            [avg_distance_km]
        ] = await Promise.all([
            db.promise().query(`
                SELECT 
                  DATE(journey_start_time) AS date,
                  COUNT(*) AS count
                FROM journeys
                WHERE VID = ?
                GROUP BY DATE(journey_start_time)
                ORDER BY DATE(journey_start_time)
              `, [vid]),

            db.promise().query(`
                SELECT COUNT(*) AS total_journeys
                FROM journeys
                WHERE VID = ?
              `, [vid]),

            db.promise().query(`
                SELECT ROUND(AVG(TIMESTAMPDIFF(MINUTE, journey_start_time, journey_commence_time)), 1) AS avg_duration_minutes
                FROM journeys
                WHERE VID = ?
              `, [vid]),

            db.promise().query(`
                SELECT COUNT(DISTINCT DATE(journey_start_time)) AS active_days
                FROM journeys
                WHERE VID = ?
              `, [vid]),

            db.promise().query(`
                SELECT SUM(CAST(JSON_EXTRACT(journey_dataset, '$.distance_travelled') AS DECIMAL(10,2))) AS total_distance_km
                FROM journeys
                WHERE VID = ? 
                AND JSON_EXTRACT(journey_dataset, '$.distance_travelled') IS NOT NULL;
            `, [vid])
        ]);

        return {
            calendarHeatmap,
            totalJourneys,
            averageDurationMinutes: averageDuration,
            activeDays,
            average_distance: avg_distance_km,
        };
    } catch (error) {
        throw error;
    }
};

// Get vehicle speed summary
const getVehicleSpeedSummary = async (vid) => {
    try {
        const [speedSummary] = await db.promise().query(`
            SELECT
              vid,
              SUM(CAST(JSON_UNQUOTE(JSON_EXTRACT(journey_dataset, '$.speed_clock[1][1]')) AS UNSIGNED)) AS unmoving,
              SUM(CAST(JSON_UNQUOTE(JSON_EXTRACT(journey_dataset, '$.speed_clock[2][1]')) AS UNSIGNED)) AS s_1_10,
              SUM(CAST(JSON_UNQUOTE(JSON_EXTRACT(journey_dataset, '$.speed_clock[3][1]')) AS UNSIGNED)) AS s_11_20,
              SUM(CAST(JSON_UNQUOTE(JSON_EXTRACT(journey_dataset, '$.speed_clock[4][1]')) AS UNSIGNED)) AS s_21_50,
              SUM(CAST(JSON_UNQUOTE(JSON_EXTRACT(journey_dataset, '$.speed_clock[5][1]')) AS UNSIGNED)) AS s_51_80,
              SUM(CAST(JSON_UNQUOTE(JSON_EXTRACT(journey_dataset, '$.speed_clock[6][1]')) AS UNSIGNED)) AS s_81_100,
              SUM(CAST(JSON_UNQUOTE(JSON_EXTRACT(journey_dataset, '$.speed_clock[7][1]')) AS UNSIGNED)) AS s_101_120,
              SUM(CAST(JSON_UNQUOTE(JSON_EXTRACT(journey_dataset, '$.speed_clock[8][1]')) AS UNSIGNED)) AS s_121_1000
            FROM journeys
            WHERE vid = ?
          `, [vid]);

        return {
            speedClock: [
                ["Speed", "seconds counter"],
                ["idle time (not moving)", speedSummary[0].unmoving],
                ["1-10kmph", speedSummary[0].s_1_10],
                ["11-20kmph", speedSummary[0].s_11_20],
                ["21-50kmph", speedSummary[0].s_21_50],
                ["51-80kmph", speedSummary[0].s_51_80],
                ["81-100kmph", speedSummary[0].s_81_100],
                ["101-120kmph", speedSummary[0].s_101_120],
                ["121-1000kmph", speedSummary[0].s_121_1000]
            ]
        };
    } catch (error) {
        throw error;
    }
};

const getCrashDataSummary = async (vid) => {
    try {
        const escapedVid = db.escape(vid);  // important!

        const [rows] = await db.promise().query(`
            SELECT JSON_OBJECT(
                'crash_reports', (
                    SELECT JSON_ARRAYAGG(NULLIF(JSON_EXTRACT(journey_dataset, '$.crash_reports'), JSON_ARRAY()))
                    FROM journeys
                    WHERE VID = ${escapedVid}
                      AND JSON_LENGTH(JSON_EXTRACT(journey_dataset, '$.crash_reports')) > 0
                ),
                'severe_crash_reports', (
                    SELECT JSON_ARRAYAGG(NULLIF(JSON_EXTRACT(journey_dataset, '$.severe_crash_reports'), JSON_ARRAY()))
                    FROM journeys
                    WHERE VID = ${escapedVid}
                      AND JSON_LENGTH(JSON_EXTRACT(journey_dataset, '$.severe_crash_reports')) > 0
                ),
                'total_hard_braking_events', (
                    SELECT SUM(CAST(JSON_UNQUOTE(JSON_EXTRACT(journey_dataset, '$.hard_braking_events')) AS UNSIGNED))
                    FROM journeys
                    WHERE VID = ${escapedVid}
                      AND JSON_EXTRACT(journey_dataset, '$.hard_braking_events') IS NOT NULL
                ),
                'total_hard_acceleration_events', (
                    SELECT SUM(CAST(JSON_UNQUOTE(JSON_EXTRACT(journey_dataset, '$.hard_acceleration_events')) AS UNSIGNED))
                    FROM journeys
                    WHERE VID = ${escapedVid}
                      AND JSON_EXTRACT(journey_dataset, '$.hard_acceleration_events') IS NOT NULL
                ),
                'total_speeding_events', (
                    SELECT SUM(CAST(JSON_UNQUOTE(JSON_EXTRACT(journey_dataset, '$.speeding_events')) AS UNSIGNED))
                    FROM journeys
                    WHERE VID = ${escapedVid}
                      AND JSON_EXTRACT(journey_dataset, '$.speeding_events') IS NOT NULL
                ),
                'count_hard_braking_events', (
                    SELECT COUNT(*)
                    FROM journeys
                    WHERE VID = ${escapedVid}
                      AND JSON_EXTRACT(journey_dataset, '$.hard_braking_events') IS NOT NULL
                ),
                'count_hard_acceleration_events', (
                    SELECT COUNT(*)
                    FROM journeys
                    WHERE VID = ${escapedVid}
                      AND JSON_EXTRACT(journey_dataset, '$.hard_acceleration_events') IS NOT NULL
                ),
                'count_speeding_events', (
                    SELECT COUNT(*)
                    FROM journeys
                    WHERE VID = ${escapedVid}
                      AND JSON_EXTRACT(journey_dataset, '$.speeding_events') IS NOT NULL
                )
            ) AS merged_summary
        `);

        if (rows.length === 0) {
            return null;
        }

        return rows[0].merged_summary;
    } catch (error) {
        throw error;
    }
};



module.exports = {
    getVehicles,
    getVehicleById,
    registerVehicle,
    updateLocation,
    updateDeviceStatus,
    getVehicleSummary,
    getVehicleSpeedSummary,
    getCrashDataSummary
};