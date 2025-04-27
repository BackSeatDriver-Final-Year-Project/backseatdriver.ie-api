const express = require('express');
const router = express.Router();
const authRoutes = require('./auth');
const vehicleRoutes = require('./vehicle');
const journeyRoutes = require('./journey');

router.use('/', authRoutes);
router.use('/vehicles', vehicleRoutes);
router.use('/', journeyRoutes);

module.exports = router;