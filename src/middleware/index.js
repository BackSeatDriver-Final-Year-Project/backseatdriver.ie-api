const { authenticateToken } = require('./auth');
const { handleDBError } = require('./error');

module.exports = {
    authenticateToken,
    handleDBError
};