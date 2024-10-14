const express = require('express');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2');
const cors = require('cors');
const bcrypt = require('bcrypt');
const NodeCache = require('node-cache');
const myCache = new NodeCache({ stdTTL: 60, checkperiod: 120 });
const app = express();

app.use(cors()); // Enable CORS for all requests
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const port = 3000;

// JWT Secret Key (Move to environment variables in production)
const jwtSecret = process.env.JWT_SECRET || 'your_jwt_secret_key';

// Set up MySQL connection pool
const db = mysql.createPool({
    connectionLimit: 20, // Increased based on expected load
    host: '147.182.249.143',
    user: 'caolan',
    password: process.env.DB_PASSWORD || 'RIPstevejobs123@', // Store in environment variables
    database: 'backseatdriverdb',
    waitForConnections: true,
    connectTimeout: 30000, // Reduced timeout to 30 seconds
});

// Middleware to verify JWT token
function authenticateToken(req, res, next) {
    const token = req.headers['authorization'];

    if (!token) {
        return res.status(403).json({ message: 'No token provided' });
    }

    jwt.verify(token, jwtSecret, (err, user) => {
        if (err) {
            return res.status(401).json({ message: 'Failed to authenticate token' });
        }

        req.user = user; // Attach user information to the request
        next();
    });
}

// Status endpoint to check if the server is alive
app.get('/status', (req, res) => {
    res.status(200).json({ status: 'Server is alive and running!' });
});

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
                return res.status(401).json({ message: 'Passwords do not match' });
            }
        } else {
            // User not found
            return res.status(401).json({ message: 'Invalid credentials' });
        }
    });
});

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
        if (err) return handleDBError(err, res);

        // Store the results in cache
        myCache.set(`vehicles_${userId}`, results);

        res.json(results);
    });
});

// Gracefully close the database connection pool on shutdown
process.on('SIGINT', () => {
    db.end(err => {
        console.log('Database connection pool closed');
        process.exit(err ? 1 : 0);
    });
});

app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
