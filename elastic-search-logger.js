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

function setElasticFields(logData) {
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


module.exports = function (RED) {

    function LogElasticLoggerNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        node.logger = null;

        // Elastic settings
        const url = RED.util.evaluateNodeProperty(config.url, config.urlType, node);
        if (url == '') {
            node.error('Elastic search url is not set', {});
        }

        const user = RED.util.evaluateNodeProperty(this.credentials.username, config.usernameType, node);
        if (user == '') {
            node.error('Elastic search username is not set', {});
        }

        const password = RED.util.evaluateNodeProperty(this.credentials.password, config.passwordType, node);
        if (password == '') {
            node.error('Elastic search password is not set', {});
        }

        let index = RED.util.evaluateNodeProperty(this.credentials.index, config.indexType, node);
        if (index == '') {
            node.error('Elastic search index is not set', {});
        } else {
            index = index.toLowerCase();
        }

        let transports = [];

        if (url) {
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
                transformer: (logData) => {
                    try {
                        setElasticFields(logData);
                    } catch (error) {
                        node.error(error, {});
                    }
                },
                index: index,
            });

            transports.push(elasticSearchTransport);

            elasticSearchTransport.on('error', (error) => {
                node.error(`Error in elasticSearchTransport caught: ${error.message}`, {});                
            });
        }

        this.logger = new winston.createLogger({
            exitOnError: false,
            level: 'Debug',
            levels: logLevels.levels,
            transports: transports,
        });

        this.logger.on('error', (error) => {
            node.error(error, {});
        });

        this.debug('elastic-search logger created');

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
            this.logger.log(loglevel, msg.payload.message, msg.payload.meta);
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
