/* eslint-disable max-len,no-shadow,no-param-reassign,no-underscore-dangle,no-use-before-define,consistent-return */

const jsonata = require('@elastic.io/jsonata-moment');
const request = require('request-promise');
const { messages } = require('elasticio-node');
const xml2js = require('xml2js-es6-promise');
const uuidv1 = require('uuid/v1');

const attachment = require('./attachments');

const PASSTHROUGH_BODY_PROPERTY = 'elasticio';
const HTTP_ERROR_CODE_REBOUND = new Set([408, 423, 429, 500, 502, 503, 504]);

function handlePassthrough(message) {
  if (message.passthrough) {
    if (PASSTHROUGH_BODY_PROPERTY in message.body) {
      throw new Error(`${PASSTHROUGH_BODY_PROPERTY} property is reserved \
            if you are using passthrough functionality`);
    }

    // eslint-disable-next-line no-param-reassign
    message.body.elasticio = {};
    Object.assign(message.body.elasticio, message.passthrough);
  }
  return message;
}

const methodsMap = {
  DELETE: 'delete',
  GET: 'get',
  PATCH: 'patch',
  POST: 'post',
  PUT: 'put',
};

const bodyEncodings = {
  FORM_DATA: 'form-data',
  RAW: 'raw',
  URLENCODED: 'urlencoded',
};

const bodyMultipartBoundary = '__X_ELASTICIO_BOUNDARY__';

const contentTypes = {
  FORM_DATA: 'multipart/form-data',
  URLENCODED: 'application/x-www-form-urlencoded',
  TEXT: 'text/plain',
  APP_JSON: 'application/json',
  APP_XML: 'application/xml',
  TEXT_XML: 'text/xml',
  HTML: 'text/html',
};

const formattedFormDataHeader = `multipart/form-data; charset=utf8; boundary=${bodyMultipartBoundary}`;

const authTypes = {
  NO_AUTH: 'No Auth',
  BASIC: 'Basic Auth',
  API_KEY: 'API Key Auth',
  OAUTH2: 'OAuth2',
};

const CREDS_HEADER_TYPE = 'CREDS_HEADER_TYPE';

/**
 * Executes the action's/trigger's logic by sending a request to the assigned URL and emitting response to the platform.
 * The function returns a Promise sending a request and resolving the response as platform message.
 *
 * @param {Boolean} isAction if true, then handle passthrough, otherwise, there can not be any passthrough data
 * @param {Object} msg incoming messages which is empty for triggers
 * @param {Object} cfg object to retrieve triggers configuration values, such as, for example, url and userId
 * @returns {Object} promise resolving a message to be emitted to the platform
 */
/* eslint-disable-next-line func-names */
module.exports.processMethod = async function (isAction, msg, cfg) {
  const emitter = this;

  emitter.logger.debug('Input message: %o', JSON.stringify(msg));
  emitter.logger.debug('Input configuration: %o', JSON.stringify(cfg));

  const config = cfg.reader;

  if (!config.url) {
    throw new Error('URL is required');
  }

  if (isAction) {
    msg = handlePassthrough(msg);
  }

  const url = jsonata(config.url).evaluate(msg.body);
  const { method, headers } = config;
  const body = config.body || {};
  const followRedirect = cfg.followRedirect !== 'doNotFollowRedirects';
  const { auth } = cfg;

  if (!method) {
    throw new Error('Method is required');
  }

  const formattedMethod = methodsMap[method];

  if (!formattedMethod) {
    throw new Error(
      `Method "${method}" isn't one of the: ${Object.keys(methodsMap)}.`,
    );
  }

  /*
   if cfg.followRedirect has value doNotFollowRedirects
   or cfg.followRedirect is not exists
   followRedirect option should be true
   */
  const requestOptions = {
    method: formattedMethod,
    uri: url,
    followRedirect,
    followAllRedirects: followRedirect,
    gzip: true,
    resolveWithFullResponse: true,
    simple: false,
    encoding: null,
  };

  const existingAuthHeader = (headers || []).find(header => header._type === CREDS_HEADER_TYPE);

  switch (auth.type) {
    case authTypes.BASIC:
      if (existingAuthHeader) {
        existingAuthHeader.key = '';
      }

      headers.push({
        key: 'Authorization',
        // eslint-disable-next-line no-buffer-constructor
        value: `"Basic ${Buffer.from(`${auth.basic.username}:${auth.basic.password}`, 'utf8').toString('base64')}"`,
      });

      break;

    case authTypes.API_KEY:
      if (existingAuthHeader) {
        existingAuthHeader.key = '';
      }

      headers.push({
        key: auth.apiKey.headerName,
        value: `"${auth.apiKey.headerValue}"`,
      });

      break;
    case authTypes.OAUTH2:
      // eslint-disable-next-line no-case-declarations
      const token = await getValidToken();
      headers.push({
        key: 'Authorization',
        value: `"Bearer ${token}"`,
      });
      break;
    default:
      if (existingAuthHeader) {
        existingAuthHeader.key = '';
      }
  }

  if (headers && headers.length) {
    requestOptions.headers = headers.reduce(
      (headers, header) => {
        if (!header.key || !header.value) {
          return headers;
        }
        headers[header.key.toLowerCase()] = jsonata(header.value).evaluate(
          msg.body,
        );
        return headers;
      }, requestOptions.headers || {},
    );
  }

  emitter.logger.debug('Request options: %o', JSON.stringify(requestOptions));

  return buildRequestBody()
    .then(() => {
      emitter.logger.trace('Request body: %o', requestOptions.body);
      return request(requestOptions);
    })
    .then(checkErrors)
    .then(processResponse)
    .then(async (result) => {
      emitter.logger.trace('Request output: %j', result);

      if (cfg.splitResult && Array.isArray(result)) {
      // Walk through chain of promises: https://stackoverflow.com/questions/30445543/execute-native-js-promise-in-series
      // eslint-disable-next-line no-restricted-syntax
        for (const item of result) {
          const output = messages.newMessageWithBody(item);
          output.attachments = msg.attachments;
          // eslint-disable-next-line no-await-in-loop
          await emitter.emit('data', output);
        }
        await emitter.emit('end');
      } else {
        const output = messages.newMessageWithBody(result);
        output.attachments = msg.attachments;
        return output;
      }
    })
    .catch(buildErrorStructure);

  function checkOAuth2Keys(keys) {
    if (!keys) {
      throw new Error('cfg.auth.oauth2.keys can not be empty');
    }
    if (!keys.access_token) {
      throw new Error('No access tokens were returned by the OAuth2 provider');
    }
    if (!keys.refresh_token) {
      throw new Error('No refresh tokens were returned by the OAuth2 provider. Try to add access_type:offline as an additional parameter');
    }
  }

  async function fetchNewToken() {
    emitter.logger.debug('Fetching new oauth2 token...');
    const { oauth2 } = auth;
    const authTokenResponse = await request({
      uri: oauth2.tokenUri,
      method: 'POST',
      json: true,
      simple: false,
      resolveWithFullResponse: true,
      form: {
        refresh_token: oauth2.keys.refresh_token,
        grant_type: 'refresh_token',
        client_id: oauth2.clientId,
        client_secret: oauth2.clientSecret,
        scope: oauth2.scope,
      },
    });

    emitter.logger.debug('New token fetched : %o', authTokenResponse);

    if (authTokenResponse.statusCode >= 400) {
      throw new Error(`Error in authentication.  Status code: ${authTokenResponse.statusCode}, Body: ${JSON.stringify(authTokenResponse.body)}`);
    }

    return authTokenResponse.body;
  }

  async function getValidToken() {
    const { keys } = auth.oauth2;
    checkOAuth2Keys(keys);
    const tokenExpiryTime = new Date(keys.tokenExpiryTime);
    const now = new Date();
    if (now < tokenExpiryTime) {
      emitter.logger.debug('Previously valid token found.');
      return keys.access_token;
    }

    const tokenRefreshStartTime = new Date();
    auth.oauth2.keys = await fetchNewToken();
    checkOAuth2Keys(auth.oauth2.keys);
    // we need this check because expires_in is optional in oauth2
    if (auth.oauth2.keys.expires_in) {
      auth.oauth2.keys.tokenExpiryTime = (new Date(tokenRefreshStartTime.getTime()
        + (auth.oauth2.keys.expires_in * 1000))).toISOString();
    }
    emitter.emit('updateKeys', { auth });

    return auth.oauth2.keys.access_token;
  }


  function buildRequestBody() {
    if (formattedMethod !== methodsMap.GET) {
      const bodyEncoding = {
        [contentTypes.FORM_DATA]: bodyEncodings.FORM_DATA,
        [contentTypes.URLENCODED]: bodyEncodings.URLENCODED,
      }[body.contentType] || bodyEncodings.RAW;

      // eslint-disable-next-line default-case
      switch (bodyEncoding) {
        case bodyEncodings.FORM_DATA:
          // eslint-disable-next-line no-case-declarations
          const existingContentTypeHeader = headers.find(header => (
            // eslint-disable-next-line no-sequences
            header.key.match(/^content-type$/i),
            header.value === contentTypes.FORM_DATA
          ));

          if (existingContentTypeHeader) {
            existingContentTypeHeader.value = `"${formattedFormDataHeader}"`;
          } else {
            headers.push({
              key: 'Content-Type',
              value: `"${formattedFormDataHeader}"`,
            });
          }
          if (msg.attachments) {
            const attachments = Object.keys(msg.attachments).map(
              // eslint-disable-next-line no-unused-vars
              (key, index) => ({
                key,
                value: msg.attachments[key].url,
                filename: key,
                'Content-Type': msg.attachments[key]['content-type'],
              }),
            );

            // eslint-disable-next-line prefer-spread
            body.formData.push.apply(body.formData, attachments);
          }

          emitter.logger.trace('formData: %o', body.formData);

          requestOptions.body = `--${bodyMultipartBoundary}`;

          return body.formData.reduce(
            (p, x) => p.then(() => processItem(x)), Promise.resolve(),
          ).then(() => {
            requestOptions.body = `${requestOptions.body}--`;
            return requestOptions.body;
          });

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

          // eslint-disable-next-line no-case-declarations
          const evaluatedUrlencoded = body.urlencoded.map(pair => ({
            key: pair.key,
            value: jsonata(pair.value).evaluate(msg.body),
          })).reduce((str, pair, index) => {
            const equation = `${pair.key}=${pair.value}`;

            return index === 0 ? equation : `${str}&${equation}`;
          }, null);

          requestOptions.body = evaluatedUrlencoded;
          break;
      }
      emitter.logger.trace('Request body: %o', requestOptions.body);
    }

    function processItem(item) {
      if (item.filename) {
        return request(item.value).then((result) => {
          requestOptions.body = `${requestOptions.body}\nContent-Disposition: form-data; name="${item.key}"; filename:"${item.filename}"\nContent-Type:${item['Content-Type']}\n\n${result}\n--${bodyMultipartBoundary}`;
        }).catch((result) => {
          emitter.logger.trace(result);
        });
      }
      return Promise.resolve().then(() => {
        requestOptions.body = `${requestOptions.body}\nContent-Disposition: form-data; name="${item.key}"\n\n`
            + `${jsonata(item.value).evaluate(
              msg.body,
            )}\n--${bodyMultipartBoundary}`;
      });
    }

    return Promise.resolve(requestOptions.body);
  }

  function buildErrorStructure(e) {
    if (cfg.enableRebound && (HTTP_ERROR_CODE_REBOUND.has(e.code)
      || e.message.includes('DNS lookup timeout'))) {
      emitter.logger.info('Component error: %o', e);
      emitter.logger.info('Starting rebound');
      emitter.emit('rebound', e.message);
      emitter.emit('end');
    } else {
      if (cfg.dontThrowErrorFlg) {
        const output = {
          errorCode: e.code,
          errorMessage: e.message,
          errorStack: e.stack,
        };
        emitter.logger.debug('Component output: %o', output);
        return Promise.resolve(messages.newMessageWithBody(output));
      }
      emitter.logger.error('Component error: %o', e);
      return Promise.reject(e);
    }
  }

  /*
  * https://user-images.githubusercontent.com/13310949/41960520-9bd468ca-79f8-11e8-83f4-d9b2096deb6d.png
  * */
  function checkErrors(response) {
    const { statusCode } = response;
    emitter.logger.info('Response statusCode %d', statusCode);
    if (statusCode >= 200 && statusCode < 300) {
      return Promise.resolve(response);
    }
    if (statusCode >= 300 && statusCode < 400) {
      if (followRedirect) {
        const REDIRECTION_ERROR = `${response.statusMessage
          || 'Redirection error.'} Please check "Follow redirect mode" if You want to use redirection in your request.`;
        if (cfg.dontThrowErrorFlg) {
          return Promise.resolve({
            statusCode,
            statusMessage: REDIRECTION_ERROR,
            headers: response.headers,
            body: response.body,
          });
        }
        const err = new Error(
          `Code: ${statusCode} Headers: ${JSON.stringify(
            response.headers,
          )} Body: ${JSON.stringify(
            response.body,
          )}. Error Message: ${REDIRECTION_ERROR}`,
        );
        err.code = statusCode;
        err.name = 'HTTP error';
        return Promise.reject(err);
      }
      return Promise.resolve(response);
    } if (statusCode >= 400 && statusCode < 1000) {
      if (cfg.dontThrowErrorFlg) {
        return Promise.resolve({
          headers: response.headers,
          body: response.body,
          statusCode,
          statusMessage: `${response.statusMessage || 'HTTP error.'}`,
        });
      }
      let errString = `Code: ${statusCode} Message: ${response.statusMessage || 'HTTP error'}`;
      let { body } = response;
      if (body && body.toString('utf8') !== '') {
        body = body.toString('utf8');
        errString = `${errString} Body: ${body}`;
      }
      const err = new Error(errString);
      err.code = statusCode;
      err.name = 'HTTP error';
      err.body = body;
      return Promise.reject(err);
    }
  }

  /*
  * parse response structure
  *
  * 1) If body is not exists return empty object {}
  * 2) If Content-type is exists in response try to parse by content type
  * 3) If Content-type is not exists try to parse as JSON. If we get parsing error
  * we should return response as is.
  *
  */
  function processResponse(response) {
    emitter.logger.trace('HTTP Response headers: %j', response.headers);
    emitter.logger.trace('HTTP Response body: %o', response.body.toString('utf8'));

    if (response.body && response.body.byteLength === 0) {
      return Promise.resolve(buildResponseStructure({}));
    }

    const contType = response.headers['content-type'];

    emitter.logger.info('Content type: %o', contType);
    if (contType) {
      if (contType.includes('json')) {
        return Promise.resolve(response.body).then(JSON.parse).then(
          buildResponseStructure,
        );
      } if (contType.includes('xml')) {
        emitter.logger.info('trying to parse as XML');
        const parseOptions = {
          trim: false,
          normalize: false,
          explicitArray: false,
          normalizeTags: false,
          attrkey: '_attr',
          tagNameProcessors: [
            name => name.replace(':', '-'),
          ],
        };
        return xml2js(response.body, parseOptions)
          .then(buildResponseStructure).then((result) => {
            emitter.logger.info('successfully parsed');
            return result;
          });
      }
      if (contType.includes('image') || contType.includes('msword')
          || contType.includes('msexcel') || contType.includes('pdf')
          || contType.includes('csv') || contType.includes('octet-stream')
          || contType.includes('binary')) {
        return attachment.addAttachment.call(emitter, msg, `${uuidv1()}_${
          new Date().getTime()}`, response.body,
        response.headers['content-length'], contType)
          .then(() => {
            emitter.logger.info(
              `binary data with ${JSON.stringify(msg.attachments)} successfully saved to attachments`,
            );
            return {};
          });
      }
      return Promise.resolve(
        buildResponseStructure(response.body.toString('utf8')),
      );
    }
    emitter.logger.info('Unknown content-type received. trying to parse as JSON');
    return Promise.resolve(response.body).then(JSON.parse)
      .then(buildResponseStructure)
      .catch((e) => {
        emitter.logger.error(
          'Parsing to JSON object is failed. Error: %o. Returning response as is',
          e,
        );
        return buildResponseStructure(response.body.toString('utf8'));
      });


    /*
    * return new output structure only if dontThrowErrorFlg is true
    *
    * New structure requirements:
    *
    * The outbound message body should include the HTTP response body from the REST call.
    * The message payload should include a headers section with
    * all of the headers received from the REST call.
    * The HTTP status code should also be included in the message payload.
    *
    * else return body of response
    */
    function buildResponseStructure(body) {
      if (typeof body !== 'object' && !Array.isArray(body)) {
        body = { result: body };
      }
      if (Array.isArray(body) && !cfg.splitResult) {
        body = { result: body };
      }
      if (cfg.dontThrowErrorFlg) {
        return {
          headers: response.headers,
          body,
          statusCode: response.statusCode,
          statusMessage: response.statusMessage,
        };
      }
      return body;
    }
  }
};
