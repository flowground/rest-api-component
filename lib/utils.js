/* eslint-disable no-use-before-define */
const { NoAuthRestClient } = require('@elastic.io/component-commons-library');
const { BasicAuthRestClient } = require('@elastic.io/component-commons-library');
const { ApiKeyRestClient } = require('@elastic.io/component-commons-library');
const jsonata = require('@elastic.io/jsonata-moment');
const request = require('request-promise');

const PASSTHROUGH_BODY_PROPERTY = 'elasticio';

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
};

const CREDS_HEADER_TYPE = 'CREDS_HEADER_TYPE';

/**
 * Executes the action's/trigger's logic by sending a request to the assigned URL
 * and emitting response to the platform.
 * The function returns a Promise sending a request and resolving the response as platform message.
 *
 * @param {Boolean} isAction if true, then handle passthrough, otherwise,
 * there can not be any passthrough data
 * @param {Object} msg incoming messages which is empty for triggers
 * @param {Object} cfg object to retrieve triggers configuration values, such as,
 * for example, url and userId
 * @returns {Object} promise resolving a message to be emitted to the platform
 */
module.exports.processMethod = async function (isAction, msg, cfg) {
  const emitter = this;

  emitter.logger.debug('Input message: %o', JSON.stringify(msg));
  emitter.logger.debug('Input configuration: %o', JSON.stringify(cfg));

  const config = cfg.reader;

  if (!config.url) {
    throw new Error('URL is required');
  }

  if (isAction) {
    // eslint-disable-next-line no-param-reassign
    msg = handlePassthrough(msg);
  }

  // eslint-disable-next-line no-use-before-define
  const client = prepareClient(emitter, cfg);
  const url = jsonata(config.url).evaluate(msg.body);
  const { method, headers } = config;
  const body = config.body || {};
  const followRedirect = cfg.followRedirect !== 'doNotFollowRedirects';

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
    url,
    method: formattedMethod,
    followRedirect,
    followAllRedirects: followRedirect,
    gzip: true,
    resolveWithFullResponse: true,
    simple: false,
    encoding: null,
    urlIsSegment: false,
    // eslint-disable-next-line no-underscore-dangle
    headers: (headers || []).find(header => header._type === CREDS_HEADER_TYPE),
  };

  if (headers && headers.length) {
    requestOptions.headers = headers.reduce(
      // eslint-disable-next-line no-shadow
      (headers, header) => {
        if (!header.key || !header.value) {
          return headers;
        }
        // eslint-disable-next-line no-param-reassign
        headers[header.key.toLowerCase()] = jsonata(header.value).evaluate(
          msg.body,
        );
        return headers;
      }, requestOptions.headers || {},
    );
  }

  emitter.logger.debug('Request options: %o', JSON.stringify(requestOptions));

  try {
    buildRequestBody();
    emitter.logger.trace('Request body: %o', requestOptions.body);
    const requestResult = await client.makeRequest(requestOptions);
    const checkedResult = await client.checkErrors(requestResult);
    const processedResult = await client.processResponse(checkedResult, msg);
    return client.buildResultMessage(processedResult, msg);
  } catch (e) {
    return client.buildErrorStructure(e);
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
            // eslint-disable-next-line no-use-before-define
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
};

function prepareClient(emitter, cfg) {
  switch (cfg.auth.type) {
    case authTypes.BASIC:
      emitter.logger.debug('Creating Basic Auth client...');
      // eslint-disable-next-line no-param-reassign
      cfg.username = cfg.username || cfg.auth.basic.username;
      // eslint-disable-next-line no-param-reassign
      cfg.password = cfg.password || cfg.auth.basic.password;
      return new BasicAuthRestClient(emitter, cfg);
    case authTypes.API_KEY:
      emitter.logger.debug('Creating Api Key Auth client...');
      // eslint-disable-next-line no-param-reassign
      cfg.apiKeyHeaderName = cfg.apiKeyHeaderName || cfg.auth.apiKey.headerName;
      // eslint-disable-next-line no-param-reassign
      cfg.apiKeyHeaderValue = cfg.apiKeyHeaderValue || cfg.auth.apiKey.headerValue;
      return new ApiKeyRestClient(emitter, cfg);
    default:
      emitter.logger.debug('Creating No auth Client...');
      return new NoAuthRestClient(emitter, cfg);
  }
}
