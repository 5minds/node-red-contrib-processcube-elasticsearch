module.exports = function (RED) {
    'use strict';

    const Error = 'Error';
    const Warning = 'Warning';
    const Information = 'Information';
    const Debug = 'Debug';

    function LogElasticNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        this.on('input', function (msg) {
            node.logger = RED.nodes.getNode(config.logger);

            let loglevel = config.loglevel || '';

            if (node.logger) {
                let level;
                if (loglevel === Error || loglevel === Warning || loglevel === Information || loglevel === Debug) {
                    // fixed level
                    level = loglevel;
                } else {
                    // get loglevel from message
                    try {
                        level = RED.util.getMessageProperty(msg, loglevel);
                    } catch (err) {
                        level = Debug;
                    }

                    if (!(level === Error || level === Warning || level === Information || level === Debug)) {
                        // invalid log level, default to debug
                        level = Debug;
                    }
                }

                try {
                    node.logger.addToLog(level, msg);
                } catch (err) {
                    node.error(err);
                }
            }
        });
    }

    RED.nodes.registerType('elastic-search', LogElasticNode);
};
