module.exports = function (RED) {
  "use strict";

  function LogElasticLoggerNode(config) {
    let winston = require('winston');
    let winstonElasticSearch = require('winston-elasticsearch');
    let os = require("os");
    this.hostname = os.hostname();

    RED.nodes.createNode(this, config);
    this.logger = null;
    let transports = [];

    // Elastic settings
    let url = config.url;
    let user = this.credentials.username || '';
    let password = this.credentials.password || '';
    let index = this.credentials.index || '';
    if (index == '') {
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
    logData = mergeFieldsIntoMessage(logData, node);

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

  // Extract {fields} from message and add them to meta.
  // Store original message in messageTemplate.
  // Replace {fields} with values in message.
  function mergeFieldsIntoMessage(logData, node) {
    try {
      if (logData.message == null) {
        node.error("Message is null");
        return logData;
      }

      var fieldNames = extractAllFieldNames(logData);
      addAllFieldsToMeta(logData, fieldNames);
      replaceFieldsInMessage(logData, fieldNames);
      addFixedFieldsToLogData(logData, node);
    } catch (error) {
      const serializedLogData = serializeData(logData);
      node.error(`Error merging fields into message: ${error.message}\nlogData: ${serializedLogData}\nStack trace: ${error.stack}`);
    }

    return logData;
  }

  function extractAllFieldNames(logData) {
    var fieldNames = [];
    var message = logData.message;

    var index = 0;
    while (index != -1 && fieldNames.length < logData.meta?.fields?.length) {
      index = message.indexOf("{", index);
      if (index != -1) {
        var endIndex = message.indexOf("}", index);
        var fieldName = message.substring(index + 1, endIndex);
        fieldNames.push(fieldName);
        index = endIndex;
      }
    }

    return fieldNames;
  }

  function addAllFieldsToMeta(logData, fieldNames) {
    for (var i = 0; i < fieldNames.length; i++) {
      var fieldName = fieldNames[i];
      var fieldValue = logData.meta.fields[i];

      if (typeof fieldValue === 'string') {
        if (fieldValue.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
          logData.meta[fieldName + "_Guid"] = fieldValue;
        } else {
          logData.meta[fieldName + "_String"] = fieldValue;
        }
      } else if (typeof fieldValue === 'number') {
        logData.meta[fieldName + "_Number"] = fieldValue;
      } else if (typeof fieldValue === 'boolean') {
        logData.meta[fieldName + "_Boolean"] = fieldValue;
      } else if (typeof fieldValue === 'object' && fieldValue instanceof Date) {
        logData.meta[fieldName + "_DateTime"] = fieldValue;
      } else {
        logData.meta[fieldName] = fieldValue;
      }
    }
  }

  function replaceFieldsInMessage(logData, fieldNames) {
    // Replace all field names in message with values from fields
    logData.messageTemplate = logData.message.slice();
    for (var i = 0; i < fieldNames.length; i++) {
      var fieldName = fieldNames[i];
      var fieldValue = logData.meta.fields[i];
      var replacement = typeof fieldValue === 'string' ? "'" + fieldValue + "'" : fieldValue;
      logData.message = logData.message.replace("{" + fieldName + "}", replacement);
    }

    // Remove fields from meta
    delete logData.meta.fields;
  }

  function addFixedFieldsToLogData(logData, node) {
    logData.meta['Origin_String'] = 'Node-RED';
    logData.meta['MachineName_String'] = node.hostname;
  }

  function serializeData(data) {
    return JSON.stringify(data, (key, value) => {
      if (typeof value === 'object' && value !== null && value !== undefined) {
        if (value instanceof Date) {
          return value.toISOString();
        }
      }
      return value;
    }, 2);
  }
};
