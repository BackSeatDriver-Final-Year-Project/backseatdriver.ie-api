const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { jwtSecret } = require('../config/env');

// Register a new user
const registerUser = (username, password) => {
    return new Promise((resolve, reject) => {
        // Check if the username already exists
        const checkUserQuery = 'SELECT * FROM users WHERE username = ?';
        db.query(checkUserQuery, [username], async (err, results) => {
            if (err) {
                return reject(err);
            }

            if (results.length > 0) {
                return reject(new Error('Email already exists'));
            }

            // Hash the password before storing it
            const hashedPassword = await bcrypt.hash(password, 10);

            // Insert the new user into the database
            const insertUserQuery = 'INSERT INTO users (username, password) VALUES (?, ?)';
            db.query(insertUserQuery, [username, hashedPassword], (err, results) => {
                if (err) {
                    return reject(err);
                }
                resolve(results);
            });
        });
    });
};

// Login a user
const loginUser = (username, password) => {
    return new Promise((resolve, reject) => {
        // Query to check if user exists
        const query = 'SELECT * FROM users WHERE username = ?';
        db.query(query, [username], async (err, results) => {
            if (err) {
                return reject(err);
            }

            if (results.length > 0) {
                const user = results[0];

                // Compare the hashed password with the provided password
                const match = await bcrypt.compare(password, user.password);
                if (match) {
                    // Passwords match, generate JWT token
                    const token = jwt.sign({ id: user.id, username: user.username }, jwtSecret, { expiresIn: '1h' });
                    return resolve(token);
                } else {
                    // Passwords do not match
                    return reject(new Error('Invalid credentials'));
                }
            } else {
                // User not found
                return reject(new Error('Invalid credentials'));
            }
        });
    });
};

module.exports = {
    registerUser,
    loginUser
};