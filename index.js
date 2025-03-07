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


const io = socketIo(server, {
    cors: {
        origin: "*", // Allow all origins for testing
    }
});


const port = 3000;

// JWT Secret Key (Move to environment variables in production)
const jwtSecret = process.env.JWT_SECRET || 'your_jwt_secret_key';

app.use(cors()); // Enable CORS for all requests
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({ origin: '*', methods: ['GET', 'POST'], allowedHeaders: ['Content-Type'], credentials: true }));

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

io.on('connection', (socket) => {
    console.log('A client connected:', socket.id);

    // Handle client subscription for a specific VIN
    socket.on('subscribeToVin', (vin) => {
        socket.vin = vin; // Store VIN in socket session
        if (!subscribedClients[vin]) {
            subscribedClients[vin] = [];
        }
        subscribedClients[vin].push(socket);
        console.log(`Client subscribed to VIN: ${vin}`);
    });

    // Handle incoming OBD-II data
    socket.on('obdData', (data) => {
        console.log('Received OBD-II Data:', data);

        const { vin } = data;

        // Send data only to clients subscribed to this VIN
        if (subscribedClients[vin]) {
            subscribedClients[vin].forEach(clientSocket => {
                clientSocket.emit('updateObdData', data);
            });
        }
    });

    // Handle client disconnection
    socket.on('disconnect', () => {
        console.log('A client disconnected:', socket.id);

        // Remove client from the subscribed list
        if (socket.vin && subscribedClients[socket.vin]) {
            subscribedClients[socket.vin] = subscribedClients[socket.vin].filter(client => client.id !== socket.id);
            if (subscribedClients[socket.vin].length === 0) {
                delete subscribedClients[socket.vin]; // Remove empty VIN entry
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

        console.log(userId);

        res.json(results);
    });
})

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