const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const journeyService = require('../services/journeyService');
const { handleDBError } = require('../middleware/error');

// Get journeys for a specific vehicle
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const vehicleId = req.params.id;
        const journeys = await journeyService.getJourneys(vehicleId);
        res.json(journeys);
    } catch (error) {
        handleDBError(error, res);
    }
});

module.exports = router;