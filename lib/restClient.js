const {
  NoAuthRestClient, BasicAuthRestClient, ApiKeyRestClient, OAuth2RestClient,
} = require('@elastic.io/component-commons-library');

const authTypes = {
  NO_AUTH: 'No Auth',
  BASIC: 'Basic Auth',
  API_KEY: 'API Key Auth',
  OAUTH2: 'OAuth2',
};
class RestClient {
  constructor(context, cfg) {
    const { type } = cfg.auth;
    let client;
    if (!type || type === authTypes.NO_AUTH) {
      client = new NoAuthRestClient(context, cfg);
    } else {
      switch (type) {
        case authTypes.BASIC:
          client = new BasicAuthRestClient(context, cfg);
          break;
        case authTypes.API_KEY:
          client = new ApiKeyRestClient(context, cfg);
          break;
        case authTypes.OAUTH2:
          client = new OAuth2RestClient(context, cfg);
          break;
        default:
          throw new Error('One OAuth2 security definitions should be defined for OAuth2 type');
      }
    }
    this.client = client;
  }

  async makeRequest(options) {
    return this.client.makeRequest(options);
  }
}

module.exports.RestClient = RestClient;
