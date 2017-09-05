"use strict";
const request = require('request-promise');
const messages = require('elasticio-node').messages;

exports.process = processAction;

const methodsMapper ={
    DELETE: 'delete',
    GET: 'get',
    PATCH: 'patch',
    POST: 'post',
    PUT: 'put'
};

/**
 * Executes the action's logic by sending a request to the Petstore API and emitting response to the platform.
 * The function returns a Promise sending a request and resolving the response as platform message.
 *
 * @param msg incoming messages which is empty for triggers
 * @param cfg object to retrieve triggers configuration values, such as apiKey and pet status
 * @returns promise resolving a message to be emitted to the platform
 */
function processAction(msg, cfg) {
    const body = msg.body;

    const url = body.url;
    const method = body.method;
    const auth = body.auth;

    if (!method) {
        throw new Error('Method is required');
    }

    const formattedMethod = methodsMapper[method];

    if (!formattedMethod) {
        throw new Error(
            `Method "${method}" isn't one of the: ${Object.keys(methodsMapper)}.`
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
console.log('!!!authType', authType);
        requestOptions.auth = {
            user: auth[authType].username,
            pass: auth[authType].password,
            sendImmediately: !auth.digest
        }

        console.log('requestOptions', requestOptions);
    }

    return request[formattedMethod](requestOptions)
        .then(response => {
            return messages.newMessageWithBody({
                response
            });
        });
}
