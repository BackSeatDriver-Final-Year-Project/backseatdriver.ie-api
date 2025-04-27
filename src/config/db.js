const mysql = require('mysql2');
require('dotenv').config();

const db = mysql.createPool({
    connectionLimit: 20,
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectTimeout: 30000,
});

// Gracefully close the database connection pool on shutdown
process.on('SIGINT', () => {
    db.end(err => {
        console.log('Database connection pool closed');
        process.exit(err ? 1 : 0);
    });
});

module.exports = db;