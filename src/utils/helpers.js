// Format date to MySQL format
const formatDateForMySQL = (date) => {
    return date.toISOString().slice(0, 19).replace('T', ' ');
};

// Handle errors with logging
const logError = (context, error) => {
    console.error(`Error in ${context}:`, error);
    return error;
};

module.exports = {
    formatDateForMySQL,
    logError
};