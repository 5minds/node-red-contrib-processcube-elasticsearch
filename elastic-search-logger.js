'use strict';

module.exports = function (RED) {
        
    function removeLastSlash(str) {
        // Überprüfen, ob das letzte Zeichen ein '/' ist
        if (str.endsWith('/')) {
          // Das letzte Zeichen entfernen
          return str.slice(0, -1);
        }
        // Wenn kein '/' am Ende ist, den String unverändert zurückgeben
        return str;
      }

    function raiseErrorAndSetNodeStatus(node, message) {
        node.error(message, {});
        node.status({
            fill: 'red',
            shape: 'ring',
            text: message,
        });
    }
        
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

            const finalUrl = removeLastSlash(url);

            node._url = `${finalUrl}/${index}/_doc`;

            RED.log.info(`Using elastic url: ${node._url}`);

            if (user && password) {
                node._credentials = Buffer.from(`${user}:${password}`).toString('base64');
            }

        }

        node.addToLog = async (record) => {
            const headers = {
                'Content-Type': 'application/json',
            };
            
            if (node._credentials) {
                headers.Authorization = `Basic ${node._credentials}`;
            }

            const response = await fetch(node._url, {
                method: 'POST',
                headers,
                body: JSON.stringify(record),
            });

            const result = await response.json();
            
            return result;
        };

        this.on('close', function () {
            node.debug('elastic-search logger closed');
        });
    }

    RED.nodes.registerType('elastic-search-logger', LogElasticLoggerNode, {
        credentials: {
            username: { type: 'text' },
            password: { type: 'password' },
            index: { type: 'text' },
        },
    });
};
