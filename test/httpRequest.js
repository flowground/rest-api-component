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
                    reader: {
                        url: 'url',
                        method
                    }
                };

                const responseMessage = `hello world ${index}`;

                nock(jsonata(cfg.reader.url).evaluate(msg.body))
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
                        .to.deep.equal(responseMessage);

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
                    reader: {
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
                    nock(jsonata(cfg.reader.url).evaluate(msg.body))
                        .intercept('/', cfg.reader.method)
                        .basicAuth({
                            user: cfg.reader.auth.basic.username,
                            pass: cfg.reader.auth.basic.password
                        })
                        .delay(20 + Math.random() * 200)
                        .reply(() => {
                            done();
                        });
                } else {
                    // TODO make the working test of digest auth
                    nock(jsonata(cfg.reader.url).evaluate(msg.body)/*, {
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

        it('should pass 1 header properly', done => {
            const msg = {
                body: {
                    url: 'http://example.com'
                }
            };

            const cfg = {
                reader: {
                    url: 'url',
                    method: 'GET',
                    headers: [
                        {
                            key: 'Content-Type',
                            value: 'text/html; charset=UTF-8'
                        }
                    ]
                }
            };

            const responseMessage = `hello world`;

            nock(jsonata(cfg.reader.url).evaluate(msg.body), {
                    reqheaders: {
                        'Content-Type': 'text/html; charset=UTF-8'
                    }
                })
                .intercept('/', 'GET')
                .delay(20 + Math.random() * 200)
                .reply(function(uri, requestBody) {
                    done();
                    return [
                        200,
                        responseMessage
                    ];
                });

            processAction(msg, cfg).catch(done.fail);
        });

        it('should pass multiple headers properly', done => {
            const msg = {
                body: {
                    url: 'http://example.com'
                }
            };

            const cfg = {
                reader: {
                    url: 'url',
                    method: 'GET',
                    headers: [
                        {
                            key: 'Accept',
                            value: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                        },
                        {
                            key: 'Keep-Alive',
                            value: '300'
                        },
                        {
                            key: 'Connection',
                            value: 'keep-alive'
                        }
                    ]
                }
            };

            const responseMessage = `hello world`;

            nock(jsonata(cfg.reader.url).evaluate(msg.body), {
                    reqheaders: {
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                        'Connection': 'keep-alive',
                        'Keep-Alive': '300',
                    }
                })
                .intercept('/', 'GET')
                .delay(20 + Math.random() * 200)
                .reply(function(uri, requestBody) {
                    done();
                    return [
                        200,
                        responseMessage
                    ];
                });

            processAction(msg, cfg).catch(done.fail);
        });

        describe('when request body is passed', () => {
            it('should properly pass raw body', done => {
                const msg = {
                    body: {
                        url: 'http://example.com'
                    }
                };

                const rawString = 'Lorem ipsum dolor sit amet, consectetur'
                    + ' adipiscing elit. Quisque accumsan dui id dolor '
                    + 'cursus, nec pharetra metus tincidunt';

                const cfg = {
                    reader: {
                        url: 'url',
                        method: 'POST',
                        body: {
                            raw: rawString
                        }
                    }
                };

                const responseMessage = `hello world`;

                nock(jsonata(cfg.reader.url).evaluate(msg.body))
                    .post('/', /Lorem\sipsum/gi)
                    .delay(20 + Math.random() * 200)
                    .reply(function(uri, requestBody) {
                        done();
                        return [
                            200,
                            responseMessage
                        ];
                    });

                processAction(msg, cfg).catch(done.fail);
            });

            it('should properly pass formdata body', done => {
                const msg = {
                    body: {
                        url: 'http://example.com'
                    }
                };

                const rawString = 'Lorem ipsum dolor sit amet, consectetur'
                    + ' adipiscing elit. Quisque accumsan dui id dolor '
                    + 'cursus, nec pharetra metus tincidunt';

                const cfg = {
                    reader: {
                        url: 'url',
                        method: 'POST',
                        body: {
                            formData: [
                                {
                                    key: 'foo',
                                    value: 'bar'
                                },
                                {
                                    key: 'baz',
                                    value: 'qwe'
                                },
                                {
                                    key: 'hello',
                                    value: 'world'
                                }
                            ]
                        }
                    }
                };

                const responseMessage = `hello world`;

                nock(jsonata(cfg.reader.url).evaluate(msg.body))
                    .post('/', {
                        foo: 'bar',
                        baz: 'qwe',
                        hello: 'world',
                    })
                    .delay(20 + Math.random() * 200)
                    .reply(function(uri, requestBody) {
                        done();
                        return [
                            200,
                            responseMessage
                        ];
                    });

                processAction(msg, cfg).catch(done.fail);
            });
        });
    });

    describe('when some args are wrong', () => {
        it('should throw error if cfg.reader.method is absent', done => {
            const msg = {
                body: {
                    url: 'example.com'
                }
            };

            const cfg = {
                reader: {
                    url: 'url'
                }
            };

            try {
                processAction(msg, cfg);
            } catch (err) {
                expect(err.message).equal('Method is required');

                done();
            }
        });

        it('should throw error if cfg.reader.url is absent', done => {
            const msg = {
                body: {
                    url: 'example.com'
                }
            };

            const cfg = {
                reader: {
                    method: 'GET'
                }
            };

            try {
                processAction(msg, cfg);
            } catch (err) {
                expect(err.message).equal('URL is required');

                done();
            }
        });

        it('should throw error if cfg.reader.method is wrong', done => {
            const msg = {
                body: {
                    url: 'example.com'
                }
            };

            const cfg = {
                reader: {
                    url: 'url',
                    method: 'GETT'
                }
            };

            try {
                processAction(msg, cfg);
            } catch (err) {
                expect(err.message).equal(
                    `Method "${cfg.reader.method}" isn't one of the: DELETE,GET,PATCH,POST,PUT.`
                );

                done();
            }
        });
    });
});
