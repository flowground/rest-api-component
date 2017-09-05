const jsonata    = require('jsonata');
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
                        url: 'http://example.com'
                    }
                };

                const cfg = {
                    config: {
                        url: 'url',
                        method
                    }
                };

                const responseMessage = `hello world ${index}`;

                nock(jsonata(cfg.config.url).evaluate(msg.body))
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
                        url: 'http://example.com'
                    }
                };

                const cfg = {
                    config: {
                        url: 'url',
                        method: 'GET',
                        auth: {
                            [authType]: {
                                username: 'John',
                                password: 'Doe'
                            }
                        }
                    }
                };

                const responseMessage = `hello world ${i}`;

                if (authType === 'basic') {
                    nock(jsonata(cfg.config.url).evaluate(msg.body))
                        .intercept('/', cfg.config.method)
                        .basicAuth({
                            user: cfg.config.auth.basic.username,
                            pass: cfg.config.auth.basic.password
                        })
                        .delay(20 + Math.random() * 200)
                        .reply(() => {
                            done();
                        });
                } else {
                    // TODO make the working test of digest auth
                    nock(jsonata(cfg.config.url).evaluate(msg.body)/*, {
                            reqheaders: {
                                'authorization': 'Digest Auth'
                            }
                        }*/)
                        .get('/')
                        .delay(20 + Math.random() * 200)
                        .reply(function(uri, requestBody) {
                            done();
                        });
                }

                processAction(msg, cfg).catch(done.fail);
            });
        });
    });

    describe('when some args are wrong', () => {
        it('should throw error if cfg.config.method is absent', done => {
            const msg = {
                body: {
                    url: 'example.com'
                }
            };

            const cfg = {
                config: {
                    url: 'url'
                }
            };

            processAction(msg, cfg).catch(err => {
                expect(err.message).equal('Method is required');

                done();
            });
        });

        it('should throw error if cfg.config.url is absent', done => {
            const msg = {
                body: {
                    url: 'example.com'
                }
            };

            const cfg = {
                config: {
                    method: 'GET'
                }
            };

            processAction(msg, cfg).catch(err => {
                expect(err.message).equal('URL is required');

                done();
            });
        });

        it('should throw error if cfg.config.method is wrong', done => {
            const msg = {
                body: {
                    url: 'example.com'
                }
            };

            const cfg = {
                config: {
                    url: 'url',
                    method: 'GETT'
                }
            };

            processAction(msg, cfg).catch(err => {
                expect(err.message).equal(
                    `Method "${cfg.config.method}" isn't one of the: DELETE,GET,PATCH,POST,PUT.`
                );

                done();
            });
        });
    });
});
