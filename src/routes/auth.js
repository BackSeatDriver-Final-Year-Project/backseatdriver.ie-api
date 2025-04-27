const express = require('express');
const router = express.Router();
const authService = require('../services/authService');
const { handleDBError } = require('../middleware/error');

// Register route for creating a new user
router.post('/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        const result = await authService.registerUser(username, password);
        res.status(201).json({ message: 'User registered successfully!' });
    } catch (error) {
        if (error.message === 'Email already exists') {
            return res.status(400).json({ message: 'Email already exists on our records' });
        }
        return res.status(401).json({ message: 'Could not register that account! Are you sure you are not already registered?' });
    }
});

// Login route for JWT authentication
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const token = await authService.loginUser(username, password);
        return res.json({ token });
    } catch (error) {
        return res.status(401).json({ message: 'Invalid credentials' });
    }
});

module.exports = router;