const express = require('express');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2');
const cors = require('cors');
const bcrypt = require('bcrypt');
const NodeCache = require('node-cache');
const http = require('http');
const socketIo = require('socket.io');
const app = express();
const server = http.createServer(app);
require('dotenv').config();

const io = socketIo(server, {
    cors: {
        origin: "*", // Allow all origins for testing
    }
});

const port = 3000;

// JWT Secret Key (Move to environment variables in production)
const jwtSecret = process.env.JWT_SECRET || 'your_jwt_secret_key';

// app.use(cors()); // Enable CORS for all requests
// app.use(express.json());
// app.use(express.urlencoded({ extended: true }));
// app.use(cors({ origin: '*', methods: ['GET', 'POST'], allowedHeaders: ['Content-Type'], credentials: true }));

// CORS configuration: Allow only your frontend domain and handle credentials properly
// app.use(cors({
//     origin: 'http://backseatdriver.ie',  // Allow your frontend domain
//     methods: ['GET', 'POST'],
//     allowedHeaders: ['Content-Type', 'Authorization'],
//     credentials: true  // If you're sending cookies or tokens, use this
//   }));

app.use(cors({
    origin: '*', // Allow any origin
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

// Other middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Set up MySQL connection pool
const db = mysql.createPool({
    connectionLimit: 20, // Adjust based on expected load
    host: '147.182.249.143',
    user: 'caolan',
    password: process.env.DB_PASSWORD || 'RIPstevejobs123@', // Store in environment variables
    database: 'backseatdriverdb',
    waitForConnections: true,
    connectTimeout: 30000, // 30 seconds timeout
});

// Initialize cache with a TTL of 60 seconds
const myCache = new NodeCache({ stdTTL: 60, checkperiod: 120 });

// Store subscribed clients by VIN
let subscribedClients = {};

const lastJourneyData = {}; // Global variable to track journey data

io.on('connection', (socket) => {
    console.log('A client connected:', socket.id);

    // Initialize journey data
    lastJourneyData[socket.id] = {
        vin: null, // To be set on first OBD data received
        journey_start_time: null, // To be updated dynamically
        journey_commence_time: null, // Set on disconnect
        journey_dataset: [],
        speed_dataset: [],
        fuel_usage_dataset: [],
        last_obd_message: null
    };

    socket.on('subscribeToVin', (vin) => {
        socket.vin = vin;
        if (!subscribedClients[vin]) {
            subscribedClients[vin] = [];
        }
        subscribedClients[vin].push(socket);
        console.log(`Client subscribed to VIN: ${vin}`);
    });

    socket.on('obdData', (data) => {
        const { vin, vehicleSpeed, fuelLevel } = data;

        if (!lastJourneyData[socket.id].vin) {
            lastJourneyData[socket.id].vin = vin;  // Assign VIN on first OBD message
        }

        // If journey_start_time is null, set it to the first received OBD data time
        if (!lastJourneyData[socket.id].journey_start_time) {
            const now = new Date();
            const formattedDate = now.toISOString().slice(0, 19).replace('T', ' ');
            // formattedDate = '2025-03-30 16:08:39' (example)

            lastJourneyData[socket.id].journey_start_time = formattedDate;
        }

        // Store OBD Data
        // lastJourneyData[socket.id].journey_dataset.push(data);
        lastJourneyData[socket.id].journey_dataset = data;
        lastJourneyData[socket.id].speed_dataset.push({ time: new Date().toISOString(), speed: vehicleSpeed });
        lastJourneyData[socket.id].fuel_usage_dataset.push({ time: new Date().toISOString(), fuelLevel });
        lastJourneyData[socket.id].last_obd_message = data;

        if (subscribedClients[vin]) {
            subscribedClients[vin].forEach(clientSocket => {
                clientSocket.emit('updateObdData', data);
            });
        }
    });

    socket.on('disconnect', () => {
        console.log('A client disconnected:', socket.id);

        if (lastJourneyData[socket.id]) {
            const { vin, journey_start_time, journey_dataset, speed_dataset, fuel_usage_dataset } = lastJourneyData[socket.id];

            if (!vin || !journey_start_time) {
                console.warn('No valid journey data recorded, skipping database insert.');
                console.log(vin);
                console.log(journey_start_time);
                return;
            }

            // Set the actual end time when the client disconnects
            now = new Date();
            const journey_end_time = now.toISOString().slice(0, 19).replace('T', ' ');

            console.log({
                vin,
                journey_start_time,
                journey_end_time
            });

            // Save the journey data
            const journeyQuery = `
                INSERT INTO journeys (VID, journey_start_time, journey_commence_time, journey_dataset, speed_dataset, fuel_usage_dataset) 
                VALUES (?, ?, ?, ?, ?, ?)
            `;

            db.query(journeyQuery, [
                3, // Replace with actual VID lookup
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

            // Clean up memory
            delete lastJourneyData[socket.id];
        }

        if (socket.vin && subscribedClients[socket.vin]) {
            subscribedClients[socket.vin] = subscribedClients[socket.vin].filter(client => client.id !== socket.id);
            if (subscribedClients[socket.vin].length === 0) {
                delete subscribedClients[socket.vin];
            }
        }
    });
});


// Middleware to verify JWT token
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
        return res.status(403).json({ message: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
        return res.status(403).json({ message: 'Malformed token' });
    }

    jwt.verify(token, jwtSecret, (err, user) => {
        if (err) {
            return res.status(401).json({ message: 'Failed to authenticate token' });
        }
        req.user = user; // Attach user information to the request
        next();
    });
}

// Error handler for database errors
const handleDBError = (err, res) => {
    console.error('Database error:', err);
    res.status(500).json({ message: 'Database error', error: err });
};


app.get('/vehicle-summary/:vid', async (req, res) => {
    const vid = req.params.vid;

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
        SELECT AVG(CAST(JSON_EXTRACT(journey_dataset, '$.distance_travelled') AS DECIMAL(10,2))) AS avg_distance_km
        FROM journeys
        WHERE VID = ? 
        AND JSON_EXTRACT(journey_dataset, '$.distance_travelled') IS NOT NULL;
        `, [vid])
        ]);

        res.json({
            calendarHeatmap: calendarHeatmap,//[0],
            totalJourneys: totalJourneys,//[0][0],//.total_Journeys,
            averageDurationMinutes: averageDuration,//[0][0].avg_duration_minutes,
            activeDays: activeDays,//[0][0].active_days
            average_distance: avg_distance_km,
        });
    } catch (error) {
        console.error('Error fetching vehicle summary:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});


app.get('/vehicle-speed-summary/:vid', async (req, res) => {
    const vid = req.params.vid;

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

        res.json({
            speedClock: [
                ["Speed", "seconds counter"],
                ["idle time (not moving)", speedSummary[0].unmoving],
                ["1-10kmph", speedSummary[0].s_1_10],
                ["11-20kmph", speedSummary[0].s_11_20],
                ["21-50kmph", speedSummary[0].s_21_50],
                ["51-80kmph", speedSummary[0].s_51_80],
                ["81-100kmph", speedSummary[0].s_81_100],
                ["101-120kmph", speedSummary.s_101_120],
                ["121-1000kmph", speedSummary.s_121_1000]
            ]
        });

    } catch (error) {
        console.error('Error fetching vehicle speed summary:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});



// Register route for creating a new user
app.post('/register', async (req, res) => {
    const { username, password } = req.body;

    // Check if the username already exists
    const checkUserQuery = 'SELECT * FROM users WHERE username = ?';
    db.query(checkUserQuery, [username], async (err, results) => {
        if (err) {
            return handleDBError(err, res);
        }

        if (results.length > 0) {
            return res.status(400).json({ message: 'Username already exists' });
        }

        // Hash the password before storing it
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insert the new user into the database
        const insertUserQuery = 'INSERT INTO users (username, password) VALUES (?, ?)';
        db.query(insertUserQuery, [username, hashedPassword], (err, results) => {
            if (err) {
                return handleDBError(err, res);
            }

            res.status(201).json({ message: 'User registered successfully' });
        });
    });
});

// Login route for JWT authentication
app.post('/login', (req, res) => {
    const { username, password } = req.body;

    // Query to check if user exists
    const query = 'SELECT * FROM users WHERE username = ?';
    db.query(query, [username], async (err, results) => {
        if (err) {
            return handleDBError(err, res);
        }

        if (results.length > 0) {
            const user = results[0];

            // Compare the hashed password with the provided password
            const match = await bcrypt.compare(password, user.password);
            if (match) {
                // Passwords match, generate JWT token
                const token = jwt.sign({ id: user.id, username: user.username }, jwtSecret, { expiresIn: '1h' });
                return res.json({ token });
            } else {
                // Passwords do not match
                return res.status(401).json({ message: 'Invalid credentials' });
            }
        } else {
            // User not found
            return res.status(401).json({ message: 'Invalid credentials' });
        }
    });
});

// Vehicles endpoint with authentication and caching
app.get('/vehicles', authenticateToken, (req, res) => {
    const userId = req.user.id;

    // Check if the data is in the cache
    const cachedData = myCache.get(`vehicles_${userId}`);
    if (cachedData) {
        return res.json(cachedData); // Send cached data
    }

    // If not in the cache, query the database
    const query = 'SELECT * FROM registered_vehicles WHERE FK = ?';
    db.query(query, [userId], (err, results) => {
        if (err) {
            return handleDBError(err, res);
        }

        // Store the results in cache
        myCache.set(`vehicles_${userId}`, results);
        res.json(results);
    });
})


// Vehicle-specific end point for fetching journeys and caching
app.get('/journeys/:id', authenticateToken, (req, res) => {
    // const userId = req.user.id; // User ID from the token
    const vehicleId = req.params.id; // Vehicle ID from the URL parameter

    // Check if the specific vehicle data is in the cache
    const cachedData = myCache.get(`vehicle_${vehicleId}`);
    if (cachedData) {
        return res.json(cachedData); // Send cached data if available
    }

    // Query the database for the specific vehicle for the authenticated user
    const query = 'SELECT journey_id, VID, journey_start_time, journey_commence_time, journey_dataset, fuel_usage_dataset, TIMEDIFF(journey_commence_time, journey_start_time) AS journeyDuration FROM journeys WHERE VID = ? ORDER BY journey_commence_time DESC;';
    db.query(query, [vehicleId], (err, results) => {
        if (err) {
            return handleDBError(err, res); // Handle database error
        }

        if (results.length === 0) {
            return res.status(404).json({ message: 'Vehicle not found' }); // Handle case if no vehicle is found
        }

        // Store the results in cache for faster future access
        myCache.set(`journey_${vehicleId}`, results);

        res.json(results); // Send the specific vehicle data as a response
    });
});

// Vehicle-specific endpoint with authentication and caching
app.get('/vehicles/id/:id', authenticateToken, (req, res) => {
    const userId = req.user.id; // User ID from the token
    const vehicleId = req.params.id; // Vehicle ID from the URL parameter

    // Check if the specific vehicle data is in the cache
    const cachedData = myCache.get(`vehicle_${userId}_${vehicleId}`);
    if (cachedData) {
        return res.json(cachedData); // Send cached data if available
    }

    // Query the database for the specific vehicle for the authenticated user
    const query = 'SELECT * FROM registered_vehicles WHERE FK = ? AND unique_id = ?';
    db.query(query, [userId, vehicleId], (err, results) => {
        if (err) {
            return handleDBError(err, res); // Handle database error
        }

        if (results.length === 0) {
            return res.status(404).json({ message: 'Vehicle not found' }); // Handle case if no vehicle is found
        }

        // Store the results in cache for faster future access
        myCache.set(`vehicle_${userId}_${vehicleId}`, results[0]);

        res.json(results[0]); // Send the specific vehicle data as a response
    });
});

// Endpoint to register a new vehicle
app.post('/register-vehicle', authenticateToken, (req, res) => {
    const userId = req.user.id; // Extract user ID from the JWT token
    const { name, VID, last_login } = req.body;

    if (!name || !VID) {
        return res.status(400).json({ message: 'Name and VID are required' });
    }

    const query = 'INSERT INTO registered_vehicles (name, VID, FK, last_login) VALUES (?, ?, ?, ?)';
    const values = [name, VID, userId, last_login || null];

    db.query(query, values, (err, result) => {
        if (err) {
            return handleDBError(err, res);
        }

        res.status(201).json({ message: 'Vehicle registered successfully', vehicleId: result.insertId });
    });
});

// Update vehicle location
app.put('/update-location', (req, res) => {
    const { VID, latitude, longitude } = req.body;

    // Validate required fields
    if (!VID || latitude === undefined || longitude === undefined) {
        return res.status(400).json({ message: 'Missing required fields: VID, latitude, longitude' });
    }

    const query = 'UPDATE registered_vehicles SET location_lat = ?, location_long = ? WHERE VID = ?';

    db.query(query, [latitude, longitude, VID], (err, result) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ message: 'Internal server error' });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Vehicle not found' });
        }

        res.status(200).json({ message: 'Location updated successfully' });
    });
});

app.post('/update-device-status', authenticateToken, (req, res) => {
    const { vid, device_charging_level, device_charging_status, connected_device_name } = req.body;

    if (!vid || device_charging_level === undefined || !device_charging_status || !connected_device_name) {
        return res.status(400).json({ message: 'Missing required fields' });
    }

    const sql = `UPDATE registered_vehicles SET device_charging_level = ?, device_charging_status = ?, connected_device_name = ? WHERE vid = ?`;

    db.query(sql, [device_charging_level, device_charging_status, connected_device_name, vid], (err, result) => {
        if (err) {
            console.error('Database update error:', err);
            return res.status(500).json({ message: 'Database error' });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Vehicle not found' });
        }

        res.json({ message: 'Device status updated successfully' });
    });
});

// Gracefully close the database connection pool on shutdown
process.on('SIGINT', () => {
    db.end(err => {
        console.log('Database connection pool closed');
        process.exit(err ? 1 : 0);
    });
});

server.listen(port, () => {
    console.log(`Server running on ${port}`);
});