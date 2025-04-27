// Store global journey data
const lastJourneyData = {}; // Global variable to track journey data
const subscribedClients = {}; // Store subscribed clients by VIN

// Export both objects for use in socket handlers
module.exports = {
    lastJourneyData,
    subscribedClients
};