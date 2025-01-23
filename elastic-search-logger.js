'use strict';

const winston = require('winston');
const winstonElasticSearch = require('winston-elasticsearch');
const { ElasticsearchTransformer } = require('winston-elasticsearch');

const logLevels = {
    levels: {
        Error: 0,
        Warning: 1,
        Information: 2,
        Debug: 3
    }
};

function transformElasticFields(logData) {
    const transformed = ElasticsearchTransformer(logData);

    transformed['@timestamp'] = logData.timestamp ? logData.timestamp : new Date().toISOString();
    transformed.message = logData.message;
    transformed.messageTemplate = logData.messageTemplate;
    transformed.severity = logData.level;
    transformed.level = logData.level;
    transformed.fields = logData.meta;

    if (logData.meta['transaction.id']) {
        transformed.transaction = { id: logData.meta['transaction.id'] };
    }

    if (logData.meta['trace.id']) {
        transformed.trace = {
            id: logData.meta['trace.id']
        };
    }

    if (logData.meta['span.id']) {
        transformed.span = {
            id: logData.meta['span.id']
        };
    }

    return transformed;
}

function raiseErrorAndSetNodeStatus(node, message) {
    node.error(message, {});
    node.status({
        fill: 'red',
        shape: 'ring',
        text: message,
    });
}


// TODO: MM winston-elasticsearch/index.js#112 wird die log als async function deklariert, 
// aber nicht als async aufgerufen
process.on('unhandledRejection', (reason, promise) => {
    console.error(`Unhandled Rejection at ${promise} reason: ${reason}`, {});
});    


module.exports = function (RED) {

    function LogElasticLoggerNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        node.logger = null;

        // Elastic settings
        const url = RED.util.evaluateNodeProperty(config.url, config.urlType, node);
        if (!url || url === 'undefined') {
            raiseErrorAndSetNodeStatus(node, 'Elastic search url is not set');
        }

        const user = RED.util.evaluateNodeProperty(this.credentials.username, config.usernameType, node);
        if (!user || user === 'undefined') {
            raiseErrorAndSetNodeStatus(node, 'Elastic search username is not set');
        }

        const password = RED.util.evaluateNodeProperty(this.credentials.password, config.passwordType, node);
        if (!password || password === 'undefined') {
            raiseErrorAndSetNodeStatus(node, 'Elastic search password is not set');
        }

        let index = RED.util.evaluateNodeProperty(this.credentials.index, config.indexType, node);
        if (!index || index === 'undefined') {
            raiseErrorAndSetNodeStatus(node, 'Elastic search index is not set');
        } else {
            index = index.toLowerCase();
        }

        if (url) {
            const transports = [];
            const elasticSearchTransport = new winstonElasticSearch.ElasticsearchTransport({
                clientOpts: {
                    node: url,
                    auth: {
                        username: user,
                        password: password,
                    },
                    ssl: {
                        // accept any
                        rejectUnauthorized: false,
                    },
                },
                transformer: (logData) => transformElasticFields(logData),
                index: index,
            });

            transports.push(elasticSearchTransport);

            elasticSearchTransport.on('error', (error) => {
                raiseErrorAndSetNodeStatus(node, `Error in elasticSearchTransport caught: ${error.message}`);
            });

            node.logger = new winston.createLogger({
                exitOnError: false,
                level: 'Debug',
                levels: logLevels.levels,
                transports: transports,
            });

            node.logger.on('error', (error) => {
                raiseErrorAndSetNodeStatus(node, `Error in logger caught: ${error.message}`);
            });

            this.debug('elastic-search logger created');
        }


        this.on('close', function () {
            // close logger
            if (node.logger) {
                node.logger.close();
            }

            node.debug('elastic-search logger closed');
        });
    }

    LogElasticLoggerNode.prototype.addToLog = function addTolog(loglevel, msg) {
        try {
            if (this.logger == null) {
                raiseErrorAndSetNodeStatus(this, `Elastic search logger is not initialized: ${JSON.stringify(msg)}`);
            } else {
                this.logger.log(loglevel, msg.payload.message, msg.payload.meta);
            }
        } catch (error) {
            this.error(error, msg);
        }
    };

    RED.nodes.registerType('elastic-search-logger', LogElasticLoggerNode, {
        credentials: {
            username: { type: 'text' },
            password: { type: 'password' },
            index: { type: 'text' },
        },
    });
};
