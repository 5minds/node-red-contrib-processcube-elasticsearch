module.exports = function (RED) {
    'use strict';

    const Error = 'Error';
    const Warning = 'Warning';
    const Information = 'Information';
    const Debug = 'Debug';

    function mapMessage(msg) {
        const transformed = {};

        transformed['@timestamp'] = msg.payload.timestamp ? msg.timestamp : new Date().toISOString();
        transformed.message = msg.payload.message;
        transformed.messageTemplate = msg.payload.messageTemplate;
        transformed.severity = msg.payload.level;
        transformed.level = msg.payload.level;
        let meta = msg.payload.meta;

        if (meta['transaction.id']) {
            transformed.transaction = { id: meta['transaction.id'] };

            delete meta['transaction.id'];
        }

        if (msg.payload.meta['trace.id']) {
            transformed.trace = { id: meta['trace.id'] };

            delete meta['trace.id'];
        }

        if (msg.payload.meta['span.id']) {
            transformed.span = { id: meta['span.id'] };

            delete meta['span.id'];
        }

        transformed.fields = meta;

        return transformed;
    }


    function LogElasticNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        this.on('input', async function (msg) {
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

                    const mappedMessage = mapMessage(msg);

                    const result = await node.logger.addToLog(mappedMessage);

                    msg.payload = result;

                    node.send(msg);
                } catch (err) {
                    node.error(err);
                }
            }
        });
    }

    RED.nodes.registerType('elastic-search', LogElasticNode);
};
