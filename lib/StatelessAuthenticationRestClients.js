/* eslint-disable no-underscore-dangle,class-methods-use-this */
const { promisify } = require('util');
const request = promisify(require('request'));
const removeTrailingSlash = require('remove-trailing-slash');
const removeLeadingSlash = require('remove-leading-slash');

const NoAuthRestClient = class NoAuthRestClient {
  constructor(emitter, cfg) {
    this.emitter = emitter;
    this.cfg = cfg;
  }

  // eslint-disable-next-line no-unused-vars
  _addAuthenticationToRequestOptions(requestOptions) {}

  async makeRequest(options) {
    const {
      url, method, body, headers = {}, urlIsSegment = true, isJson = true,
    } = options;

    const requestOptions = {
      url: urlIsSegment
        ? removeTrailingSlash(`${this.cfg.resourceServerUrl.trim()}/${removeLeadingSlash(url.trim())}`)
        : url.trim(),
      method,
      json: isJson,
      body,
      headers,
      qs: options.qs,
    };

    this._addAuthenticationToRequestOptions(requestOptions);

    const response = await request(requestOptions);

    if (response.statusCode >= 400) {
      throw new Error(`Error in making request to ${options.url} Status code: ${response.statusCode}, Body: ${JSON.stringify(response.body)}`);
    }

    return response.body;
  }
};
module.exports.NoAuthRestClient = NoAuthRestClient;

module.exports.BasicAuthRestClient = class BasicAuthRestClient extends NoAuthRestClient {
  constructor(emitter, cfg, username, password) {
    super(emitter, cfg);
    this.username = username;
    this.password = password;
  }

  _addAuthenticationToRequestOptions(requestOptions) {
    // eslint-disable-next-line no-param-reassign
    requestOptions.auth = {
      username: this.username,
      password: this.password,
    };
  }
};

module.exports.ApiKeyRestClient = class ApiKeyRestClient extends NoAuthRestClient {
  constructor(emitter, cfg, apiKeyHeaderName, apiKeyHeaderValue) {
    super(emitter, cfg);
    this.apiKeyHeaderName = apiKeyHeaderName;
    this.apiKeyHeaderValue = apiKeyHeaderValue;
  }

  _addAuthenticationToRequestOptions(requestOptions) {
    // eslint-disable-next-line no-param-reassign
    requestOptions.headers[this.apiKeyHeaderName] = this.apiKeyHeaderValue;
  }
};
