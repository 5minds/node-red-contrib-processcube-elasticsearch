
// let cause of merge custom settings

let config = {};

try {
    config = require('./settings.js');
} catch (e) {
    console.log(">>>", e);
}

process.on('uncaughtException', (err) => {
    console.error(`Uncaught Exception: ${err}`, {});
});

process.on('unhandledRejection', (reason, promise) => {
    console.error(`Unhandled Rejection at ${promise} reason: ${reason}`, {});
});    

module.exports = config;
