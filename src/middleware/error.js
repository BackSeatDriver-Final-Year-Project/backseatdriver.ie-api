// Error handler for database errors
const handleDBError = (err, res) => {
    console.error('Database error:', err);
    res.status(500).json({ message: 'Database error', error: err });
};

module.exports = {
    handleDBError
};