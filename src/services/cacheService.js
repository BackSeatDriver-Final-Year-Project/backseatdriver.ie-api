const NodeCache = require('node-cache');

// Initialize cache with a TTL of 60 seconds
const myCache = new NodeCache({ stdTTL: 60, checkperiod: 120 });

// Get data from cache
const get = (key) => {
    return myCache.get(key);
};

// Set data in cache
const set = (key, value) => {
    return myCache.set(key, value);
};

// Delete data from cache
const del = (key) => {
    return myCache.del(key);
};

// Flush all cache
const flushAll = () => {
    return myCache.flushAll();
};

module.exports = {
    get,
    set,
    del,
    flushAll
};