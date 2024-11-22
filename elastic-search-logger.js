module.exports = function (RED) {
    'use strict';

    let lock = false;

    function LogElasticLoggerNode(config) {
        let winston = require('winston');
        let winstonElasticSearch = require('winston-elasticsearch');

        RED.nodes.createNode(this, config);
        this.logger = null;
        let transports = [];

        const stopRefreshing = periodicallyRefreshElasticSettings(10000);

        function periodicallyRefreshElasticSettings(timeOut) {
            let url, user, password, index;

            function refresh() {
                if (lock) return;

                // Elastic settings
                let newUrl = RED.util.evaluateNodeProperty(config.url, config.urlType, this);
                if (newUrl == '') {
                    this.error('Elastic search url is not set');
                    return;
                }

                let newUser = RED.util.evaluateNodeProperty(this.credentials.username, config.usernameType, this);
                if (newUser == '') {
                    this.error('Elastic search username is not set');
                    return;
                }

                let newPassword = RED.util.evaluateNodeProperty(this.credentials.password, config.passwordType, this);
                if (newPassword == '') {
                    this.error('Elastic search password is not set');
                    return;
                }

                let newIndex = RED.util.evaluateNodeProperty(this.credentials.index, config.indexType, this);
                if (newIndex == '') {
                    this.error('Elastic search index is not set');
                    return;
                }

                if (newUrl === url && newUser === user && newPassword === password && newIndex === index) {
                    return;
                }

                url = newUrl;
                user = newUser;
                password = newPassword;
                index = newIndex;

                index = index.toLowerCase();
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
                        transformer: (logData) => setElasticFields(logData, this),
                        index: index,
                    });

                    transports = [elasticSearchTransport];

                    elasticSearchTransport.on('error', (error) => {
                        this.error(`Error in elasticSearchTransport caught: ${error.message}`);
                        console.error('Error in elasticSearchTransport caught', error);
                    });
                }

                let logLevels = {
                    levels: {
                        Error: 0,
                        Warning: 1,
                        Information: 2,
                        Debug: 3,
                    },
                };

                const newLogger = new winston.createLogger({
                    exitOnError: false,
                    level: 'Debug',
                    levels: logLevels.levels,
                    transports: transports,
                });

                lock = true;

                try {
                    if (this.logger) this.logger.close();

                    this.logger = newLogger;
                } finally {
                    lock = false;
                }

                this.debug('elastic-search logger created');
            }

            refresh();
            const intervalId = setInterval(refresh, timeOut);

            return () => clearInterval(intervalId);
        }

        this.on('close', function (removed, done) {
            stopRefreshing();
            // close logger
            if (this.logger) {
                this.logger.close();
            }

            this.debug('elastic-search logger closed');

            if (done) done();
        });
    }

    function setElasticFields(logData, node) {
        let { ElasticsearchTransformer } = require('winston-elasticsearch');
        const transformed = ElasticsearchTransformer(logData);
        transformed['@timestamp'] = logData.timestamp ? logData.timestamp : new Date().toISOString();
        transformed.message = logData.message;
        transformed.messageTemplate = logData.messageTemplate;
        transformed.severity = logData.level;
        transformed.level = logData.level;
        transformed.fields = logData.meta;

        if (logData.meta['transaction.id']) transformed.transaction = { id: logData.meta['transaction.id'] };
        if (logData.meta['trace.id']) transformed.trace = { id: logData.meta['trace.id'] };
        if (logData.meta['span.id']) transformed.span = { id: logData.meta['span.id'] };

        return transformed;
    }

    RED.nodes.registerType('elastic-search-logger', LogElasticLoggerNode, {
        credentials: {
            username: { type: 'text' },
            password: { type: 'password' },
            index: { type: 'text' },
        },
    });

    LogElasticLoggerNode.prototype.addToLog = function addTolog(loglevel, msg) {
        if (!lock && this.logger) this.logger.log(loglevel, msg.payload.message, msg.payload.meta);
    };
};
