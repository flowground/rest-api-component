"use strict";

const processMethod = require('../utils.js').processMethod;

const request = require('request');

exports.process = processAction;

function processAction(msg, cfg) {
    return processMethod(true, msg, cfg);

    const requestOptions = {
        uri: getURL(cfg),
        body: {
            channel: msg.body.channel,
            workAutomationId: msg.body.workAutomationId,
            messageType: msg.body.messageType,
            status: msg.body.status,
            message: msg.body.message
        }
    };

    return new Promise((resolve, reject) => {
        request['post'](requestOptions, function(error, response, body) {
            if (error) {
                return reject(error);
            }

            try {
                console.log('response:', body);

                const result = body
                    ? JSON.parse(body)
                    : {};

                resolve(messages.newMessageWithBody(result));
            } catch(e) {
                return reject(
                    new Error(
                        `Cannot parse response body.` +
                        ` It should be object or array of objects in JSON format.` +
                        ` Response content-type: ${response.headers['content-type']}.` +
                        ` Response body: ${body}.`
                    )
                );
            }
        });
    });
}

function getURL(cfg) {
    return `${cfg.url}:${cfg.port}/${cfg.tenant_id}/api/rsConnectService/status`
}
