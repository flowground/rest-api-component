"use strict";

const jsonata = require('jsonata');
const request = require('request-promise');
const messages = require('elasticio-node').messages;

exports.process = processAction;

const methodsMap ={
    DELETE: 'delete',
    GET: 'get',
    PATCH: 'patch',
    POST: 'post',
    PUT: 'put'
};

/**
 * Executes the action's logic by sending a request to the assigned URL and emitting response to the platform.
 * The function returns a Promise sending a request and resolving the response as platform message.
 *
 * @param msg incoming messages which is empty for triggers
 * @param cfg object to retrieve triggers configuration values, such as, for example, url and userId
 * @returns promise resolving a message to be emitted to the platform
 */
async function processAction(msg, cfg) {
    if (!cfg.config.url) {
        throw new Error('URL is required');
    }

    const url = jsonata(cfg.config.url).evaluate(msg.body);
    const method = cfg.config.method;
    const auth = cfg.config.auth;

    if (!method) {
        throw new Error('Method is required');
    }

    const formattedMethod = methodsMap[method];

    if (!formattedMethod) {
        throw new Error(
            `Method "${method}" isn't one of the: ${Object.keys(methodsMap)}.`
        );
    }

    if (!url) {
        throw new Error('URL is required');
    }

    const requestOptions = {
        uri: url
    };

    if (auth) {
        if (!auth.basic && !auth.digest) {
            throw new Error('Auth type is required');
        }

        const authType = auth.basic ? 'basic' : 'digest';

        requestOptions.auth = {
            user: auth[authType].username,
            pass: auth[authType].password,
            sendImmediately: !auth.digest
        }

    }
    // console.log('requestOptions', requestOptions);
    const response = await request[formattedMethod](requestOptions);

    return messages.newMessageWithBody({response});
}
