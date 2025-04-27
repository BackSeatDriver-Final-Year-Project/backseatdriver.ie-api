const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const vehicleService = require('../services/vehicleService');
const { handleDBError } = require('../middleware/error');

// Get all vehicles for authenticated user
router.get('/', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const vehicles = await vehicleService.getVehicles(userId);
        res.json(vehicles);
    } catch (error) {
        handleDBError(error, res);
    }
});

// Get specific vehicle by ID
router.get('/id/:id', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const vehicleId = req.params.id;
        const vehicle = await vehicleService.getVehicleById(userId, vehicleId);
        
        if (!vehicle) {
            return res.status(404).json({ message: 'Vehicle not found' });
        }
        
        res.json(vehicle);
    } catch (error) {
        handleDBError(error, res);
    }
});

// Register a new vehicle
router.post('/register', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { name, VID } = req.body;
        
        if (!name || !VID) {
            return res.status(400).json({ message: 'Name and VID are required' });
        }
        
        const result = await vehicleService.registerVehicle(userId, name, VID);
        res.status(201).json({ message: 'Vehicle registered successfully', vehicleId: result.insertId });
    } catch (error) {
        handleDBError(error, res);
    }
});

// Update vehicle location
router.put('/update-location', async (req, res) => {
    try {
        const { VID, latitude, longitude } = req.body;
        
        if (!VID || latitude === undefined || longitude === undefined) {
            return res.status(400).json({ message: 'Missing required fields: VID, latitude, longitude' });
        }
        
        const result = await vehicleService.updateLocation(VID, latitude, longitude);
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Vehicle not found' });
        }
        
        res.status(200).json({ message: 'Location updated successfully' });
    } catch (error) {
        handleDBError(error, res);
    }
});

// Update device status
router.post('/update-device-status', authenticateToken, async (req, res) => {
    try {
        const { vid, device_charging_level, device_charging_status, connected_device_name } = req.body;
        
        if (!vid || device_charging_level === undefined || !device_charging_status || !connected_device_name) {
            return res.status(400).json({ message: 'Missing required fields' });
        }
        
        const result = await vehicleService.updateDeviceStatus(vid, device_charging_level, device_charging_status, connected_device_name);
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Vehicle not found' });
        }
        
        res.json({ message: 'Device status updated successfully' });
    } catch (error) {
        handleDBError(error, res);
    }
});

// Get vehicle summary
router.get('/summary/:vid', async (req, res) => {
    try {
        const vid = req.params.vid;
        const summary = await vehicleService.getVehicleSummary(vid);
        res.json(summary);
    } catch (error) {
        console.error('Error fetching vehicle summary:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Get vehicle speed summary
router.get('/speed-summary/:vid', async (req, res) => {
    try {
        const vid = req.params.vid;
        const speedSummary = await vehicleService.getVehicleSpeedSummary(vid);
        res.json(speedSummary);
    } catch (error) {
        console.error('Error fetching vehicle speed summary:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Get crash data summary
router.get('/crash-data-summary/:vid', async (req, res) => {
    try {
        const vid = req.params.vid;
        const crashData = await vehicleService.getCrashDataSummary(vid);
        
        if (!crashData) {
            return res.status(404).json({ error: 'No data found for the given VID' });
        }
        
        res.json({ crashData });
    } catch (error) {
        console.error('Error fetching crash data summary:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

module.exports = router;