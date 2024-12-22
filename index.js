const express = require('express');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2');
const cors = require('cors');
const bcrypt = require('bcrypt');
const NodeCache = require('node-cache');
const app = express();

app.use(cors()); // Enable CORS for all requests
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const port = 3000;

// JWT Secret Key (Move to environment variables in production)
const jwtSecret = process.env.JWT_SECRET || 'your_jwt_secret_key';

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
});


// app test
// Add endpoint to get all records from app_list
app.post('/app_endpoint', (req, res) => {
    const query = 'SELECT * FROM app_list';

    db.query(query, (err, results) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ message: 'Failed to retrieve records', error: err });
        }

        res.json(results); // Send all records as JSON response
    });
});


app.post('/app_endpoint_family', (req, res) => {
    const query = 'SELECT * FROM app_list_family';

    db.query(query, (err, results) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ message: 'Failed to retrieve records', error: err });
        }

        res.json(results); // Send all records as JSON response
    });
});

app.post('/api/app_list_family', (req, res) => {
    const {
        Name,
        Address,
        Time,
        Description,
        Personal_msg,
        Family_flowers,
        Donations,
        Funeral_arrangement,
        Date_published,
        Funeral_time,
        Image,
    } = req.body;

    const sql = `
      INSERT INTO app_list_family
      (Name, Address, Time, Description, Personal_msg, Family_flowers, Donations, Funeral_arrangement, Date_published, Funeral_time, Image)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.query(
        sql,
        [
            Name,
            Address,
            Time,
            Description,
            Personal_msg,
            Family_flowers,
            Donations,
            Funeral_arrangement,
            Date_published,
            Funeral_time,
            Image,
        ],
        (err, result) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: 'Failed to insert data' });
            }
            res.json({ message: 'Data inserted successfully', id: result.insertId });
        }
    );
});

// app search functionality 
app.get('/search_app', (req, res) => {
    const { firstname = '', lastname = '' } = req.query; // Get query parameters

    // Ensure at least one parameter is provided
    if (!firstname && !lastname) {
        return res.status(400).json({ message: 'Please provide at least one search term for firstname or lastname' });
    }

    // Build the SQL query
    const query = `
        SELECT * 
        FROM app_list 
        WHERE name LIKE ? OR name LIKE ?
    `;
    const firstnamePattern = `%${firstname}%`;
    const lastnamePattern = `%${lastname}%`;

    db.query(query, [firstnamePattern, lastnamePattern], (err, results) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ message: 'Failed to search records', error: err });
        }

        res.json(results); // Send matching records as JSON response
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
