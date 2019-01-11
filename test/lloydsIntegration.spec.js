/* eslint-disable global-require */

const fs = require('fs');
const chai = require('chai');
const sinon = require('sinon');
const nock = require('nock');

const { expect } = chai;

const httpRequestAction = require('../lib/actions/httpRequestAction');

describe('Create xml attachment', function () {
  this.timeout(50000);
  let configuration;
  let emitter;
  let msg;

  before(async () => {
    if (fs.existsSync('.env')) {
      require('dotenv').config();
    }

    configuration = {
      reader: {
        url: '"https://data.ariva-services.de/lloydfondsag/funds.xml?isin=" & filename',
        method: 'GET',
        headers: []
      },
      auth: {},
      xmlToAttach: 'true',
    };
  });

  beforeEach(() => {
    emitter = {
      emit: sinon.spy(),
    };

    msg = { body: { filename: 'AT0000856323' } };
  });

  it('adding', async () => {
    nock('http://api-service.platform.svc.cluster.local:9000/', { encodedQueryParams: true })
      .post('/v2/resources/storage/signed-url').reply(200, { put_url: 'http://api.io/some' });
    nock('http://api.io/', { encodedQueryParams: true })
      .put('/some').reply(200, { signedUrl: { put_url: 'http://api.io/some' } });

    await httpRequestAction.process.call(emitter, msg, configuration, {});
    const result = emitter.emit.getCall(0).args[1];
    expect(result.body.filename).to.eql(msg.body.filename);
  });
});
