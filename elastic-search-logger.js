module.exports = function (RED) {
  "use strict";

  function LogElasticLoggerNode(config) {
    let winston = require('winston');
    let winstonElasticSearch = require('winston-elasticsearch');

    RED.nodes.createNode(this, config);
    this.logger = null;
    let transports = [];

    // Elastic settings
    let url = "";
    if(config.urlType == "global"){
        url = this.context().global.get(config.url);
    } else {
        url = config.url;
    }
    if (url == "") {
        this.error("Elastic search url is not set");
    }

    let user = "";
    if(config.usernameType == "global") {
        user = this.context().global.get(this.credentials.username);
    } else {
        user = this.credentials.username;
    }
    if (user == "") {
        this.error("Elastic search username is not set");
    }

    let password = "";
    if(config.passwordType == "global") {
        password = this.context().global.get(this.credentials.password);
    } else {
        password = this.credentials.password;
    }
    if (password == "") {
        this.error("Elastic search password is not set");
    }

    let index = "";
    if(config.indexType == "global") {
        index = this.context().global.get(this.credentials.index);
    } else {
        index = this.credentials.index;
    }
    if (index == "") {
        this.error("Elastic search index is not set");
    }

    index = index.toLowerCase();
    if (url) {
      const elasticSearchTransport = new winstonElasticSearch.ElasticsearchTransport({
        clientOpts: {
          node: url,
          auth: {
            username: user,
            password: password
          },
          ssl: {
            // accept any
            rejectUnauthorized: false
          }
        },
        transformer: (logData) => setElasticFields(logData, this),
        index: index
      })

      transports.push(elasticSearchTransport);

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
        Debug: 3
      }
    }
    this.logger = new winston.createLogger({
      exitOnError: false,
      level: 'Debug',
      levels: logLevels.levels,
      transports: transports
    });

    this.debug("elastic-search logger created");

    this.on('close', function (removed, done) {
      // close logger
      if (this.loggger) {
        this.logger.close();
      }

      this.debug("elastic-search logger closed");

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
  };

  RED.nodes.registerType("elastic-search-logger", LogElasticLoggerNode,
    {
      credentials: {
        username: { type: "text" },
        password: { type: "password" },
        index: { type: "text" }
      }
    });

  LogElasticLoggerNode.prototype.addToLog = function addTolog(loglevel, msg) {
    this.logger.log(loglevel, msg.payload.message, msg.payload.meta);
  }
};
