"use strict";

const jsonata = require('jsonata');
const request = require('request');
const messages = require('elasticio-node').messages;

exports.process = processTrigger;

const methodsMap = {
    DELETE: 'delete',
    GET: 'get',
    PATCH: 'patch',
    POST: 'post',
    PUT: 'put'
};

const bodyEncodings = {
    FORM_DATA: 'form-data',
    RAW: 'raw',
    URLENCODED: 'urlencoded'
};

const bodyMultipartBoundary = '__X_ELASTICIO_BOUNDARY__';

const contentTypes = {
    FORM_DATA: `multipart/form-data`,
    URLENCODED: 'application/x-www-form-urlencoded',
    TEXT: 'text/plain',
    APP_JSON: 'application/json',
    APP_XML: 'application/xml',
    TEXT_XML: 'text/xml',
    HTML: 'text/html'
};

const formattedFormDataHeader = `multipart/form-data; charset=utf8; boundary=${bodyMultipartBoundary}`;

/**
 * Executes the action's logic by sending a request to the assigned URL and emitting response to the platform.
 * The function returns a Promise sending a request and resolving the response as platform message.
 *
 * @param msg incoming messages which is empty for triggers
 * @param cfg object to retrieve triggers configuration values, such as, for example, url and userId
 * @returns promise resolving a message to be emitted to the platform
 */
 function processTrigger(msg, cfg) {
     console.log('msg:', JSON.stringify(msg));
     console.log('cfg:', JSON.stringify(cfg));

     const config = cfg.reader;

     if (!config.url) {
         throw new Error('URL is required');
     }

     const url = jsonata(config.url).evaluate(msg.body);
     const method = config.method;
     const headers = config.headers;
     const body = config.body || {};

     if (!method) {
         throw new Error('Method is required');
     }

     const formattedMethod = methodsMap[method];

     if (!formattedMethod) {
         throw new Error(
             `Method "${method}" isn't one of the: ${Object.keys(methodsMap)}.`
         );
     }

     const requestOptions = {
         uri: url
     };

     if (formattedMethod !== methodsMap.GET) {
         const bodyEncoding = {
             [contentTypes.FORM_DATA]: bodyEncodings.FORM_DATA,
             [contentTypes.URLENCODED]: bodyEncodings.URLENCODED
         }[body.contentType] || bodyEncodings.RAW;

         switch(bodyEncoding) {
             case bodyEncodings.FORM_DATA:
                 requestOptions.body = body.formData.reduce((result, pair) => {
                     return `${result}\nContent-Disposition: form-data; name="${pair.key}"\n\n` +
                         `${jsonata(pair.value).evaluate(msg.body)}\n--${bodyMultipartBoundary}`;
                 }, `--${bodyMultipartBoundary}`) + '--';

                 const existingContentTypeHeader = headers.find(header => {
                     return (
                         header.key.match(/^content-type$/i),
                         header.value === contentTypes.FORM_DATA
                     );
                 });

                 if (existingContentTypeHeader) {
                     existingContentTypeHeader.value = `"${formattedFormDataHeader}"`;
                 } else {
                     headers.push({
                         key: 'Content-Type',
                         value: `"${formattedFormDataHeader}"`
                     });
                 }

                 break;

             case bodyEncodings.RAW:
                 if (!body.raw) {
                     break;
                 }

                 requestOptions.body = jsonata(body.raw).evaluate(msg.body);

                 if (typeof requestOptions.body === 'object') {
                     requestOptions.body = JSON.stringify(requestOptions.body);
                 }

                 break;

             case bodyEncodings.URLENCODED:
                 if (!body.urlencoded.length) {
                     break;
                 }

                 const evaluatedUrlencoded = body.urlencoded.map(pair => ({
                     key: pair.key,
                     value: jsonata(pair.value).evaluate(msg.body)
                 })).reduce((str, pair, index) => {
                     const equation = `${pair.key}=${pair.value}`;

                     return index === 0 ? equation : `${str}&${equation}`;
                 }, null);

                 requestOptions.body = evaluatedUrlencoded;
                 break;
         }
     }

     if (headers && headers.length) {
         requestOptions.headers = headers.reduce(
             (headers, header) => {
                 if (!header.key || !header.value) {
                     return headers;
                 }

                 return {
                     ...headers,
                     [header.key.toLowerCase()]: jsonata(header.value).evaluate(msg.body)
                 };
             }, { ...(requestOptions.headers || {}) })
     }

     console.log('requestOptions:', JSON.stringify(requestOptions));

     return new Promise((resolve, reject) => {
         request[formattedMethod](requestOptions, function(error, response, body) {
             if (error) {
                 return reject(error);
             }

             let result;

             try {
                 result = JSON.parse(body);
             } catch(e) {
                 return reject(
                     `Cannot parse response body.` +
                     ` It should be object or array of objects in JSON format.` +
                     ` Response content-type: ${response.headers['content-type']}.` +
                     ` Response body: ${body}.`
                 );
             }

             resolve(result);
         });
     }).then(response => {
         console.log('response:', JSON.stringify(response));

         return messages.newMessageWithBody(response);
     });
 }
