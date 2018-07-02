const {expect} = require('chai');
const nock = require('nock');
const jsonata = require('@elastic.io/jsonata-moment');
const {stub} = require('sinon');

const messages = require('elasticio-node').messages;

const processAction = require('../lib/actions/httpRequestAction').process;

describe('connection error', () => {


  it('connection error && dontThrowErrorFlg false', async () => {
    const method = 'POST';
    const msg = {
      body: {
        url: 'http://example.com'
      }
    };

    const cfg = {
      dontThrowErrorFlg: false,
      reader: {
        url: 'url',
        method
      },
      auth: {}
    };

    nock(jsonata(cfg.reader.url).evaluate(msg.body))
        .intercept('/', method)
        .delay(20 + Math.random() * 200)
        .replyWithError('something awful happened');
    await processAction(msg, cfg).catch(e => {
      expect(e.message).to.be.eql('Error: something awful happened');
    });

  });
  it('connection error && dontThrowErrorFlg true', async () => {
    const method = 'POST';
    const msg = {
      body: {
        url: 'http://example.com'
      }
    };

    const cfg = {
      dontThrowErrorFlg: true,
      reader: {
        url: 'url',
        method
      },
      auth: {}
    };

    nock(jsonata(cfg.reader.url).evaluate(msg.body))
        .intercept('/', method)
        .delay(20 + Math.random() * 200)
        .replyWithError('something awful happened');

    processAction(msg, cfg).then(result=> {
      expect(result).to.deep.equal({
        "errorCode": undefined,
        "errorMessage": "Error: something awful happened",
        "errorStack": "RequestError: Error: something awful happened\n    at new RequestError (/home/nick/WebstormProjects/rest-api-component/node_modules/request-promise-core/lib/errors.js:14:15)\n    at Request.plumbing.callback (/home/nick/WebstormProjects/rest-api-component/node_modules/request-promise-core/lib/plumbing.js:87:29)\n    at Request.RP$callback [as _callback] (/home/nick/WebstormProjects/rest-api-component/node_modules/request-promise-core/lib/plumbing.js:46:31)\n    at self.callback (/home/nick/WebstormProjects/rest-api-component/node_modules/request/request.js:186:22)\n    at emitOne (events.js:116:13)\n    at Request.emit (events.js:211:7)\n    at Request.onRequestError (/home/nick/WebstormProjects/rest-api-component/node_modules/request/request.js:878:8)\n    at emitOne (events.js:116:13)\n    at OverriddenClientRequest.emit (events.js:211:7)\n    at /home/nick/WebstormProjects/rest-api-component/node_modules/nock/lib/request_overrider.js:222:11\n    at _combinedTickCallback (internal/process/next_tick.js:131:7)\n    at process._tickCallback (internal/process/next_tick.js:180:9)"
      });
    });
  });
});
;
