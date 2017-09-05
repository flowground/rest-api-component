const { stub }   = require('sinon');
const { expect } = require('chai');
const nock       = require('nock');

const request = require('request-promise');
const messages = require('elasticio-node').messages;

const processAction = require('../lib/actions/httpRequest').process;

describe('httpRequest action', () => {
    describe('when all params is correct', () => {
        let messagesNewMessageWithBodyStub;

        before(() => {
            messagesNewMessageWithBodyStub =
                stub(messages, 'newMessageWithBody').returns(Promise.resolve());
        });

        ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].forEach((method, index) => {
            it(`should properly execute ${method} request`, done => {
                const msg = {
                    body: {
                        method,
                        url: 'http://example.com'
                    }
                };

                const cfg = {};

                const responseMessage = `hello world ${index}`;

                nock(msg.body.url)
                    .intercept('/', method)
                    .delay(20 + Math.random() * 200)
                    .reply(function(uri, requestBody) {
                        // console.log('path:', this.req.path);
                        // console.log('headers:', this.req.headers);

                        return [
                            200,
                            responseMessage
                        ];
                    });

                processAction(msg, cfg).then(() => {
                    expect(messagesNewMessageWithBodyStub.getCall(index).args[0])
                        .to.deep.equal({
                            response: responseMessage
                        });

                    done();
                }).catch(done.fail);
            });
        });

        ['basic', 'digest'].forEach((authType, i) => {
            it(`should make request with http ${authType} auth`, done => {
                const msg = {
                    body: {
                        method: 'GET',
                        url: 'http://example.com',
                        auth: {}
                    }
                };

                msg.body.auth[authType] = {
                    username: 'John',
                    password: 'Doe'
                };

                const cfg = {};

                const responseMessage = `hello world ${i}`;

                if (authType === 'basic') {
                    nock(msg.body.url)
                        .intercept('/', msg.body.method)
                        .basicAuth({
                            user: msg.body.auth.basic.username,
                            pass: msg.body.auth.basic.password
                        })
                        .delay(20 + Math.random() * 200)
                        .reply(() => {
                            done();
                        });
                } else {
                    nock(msg.body.url)
                        .get('/')
                        .delay(20 + Math.random() * 200)
                        .reply(function(uri, requestBody) {
                            console.log('this.req', this.req);
                            done();
                        });
                }

                processAction(msg, cfg).catch(done.fail);
            });
        });
    });
});
