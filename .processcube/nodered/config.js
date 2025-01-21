
// let cause of merge custom settings

let config = {};

try {
    config = require('./settings.js');
} catch (e) {
    console.log(">>>", e);
}


module.exports = config;
