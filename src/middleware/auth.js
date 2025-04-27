const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../config/env');

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

module.exports = {
    authenticateToken
};