const client = require('elasticio-rest-node')();
const url = require('url');
const debug = require('debug')('attachment');
const http = require('http');
const Duplex = require('stream').Duplex;
const streamLength = require("stream-length");

exports.addAttachment = addAttachment;

function addAttachment(msg, name, body, contentLength, contentType) {
  return getUrls().then(result => {
    debug('createSignedUrl result: %j', result);
    debug('Uploading to url: %s', result.put_url);
    return uploadFile(result, contentLength, contentType);
  });


  function getUrls() {
    return client.resources.storage.createSignedUrl();
  }

  function uploadFile(urls, contentLength, contentType) {
    return new Promise((resolve, reject) => {

      const req1 = http.request(options, (res) => {
          debug('Status: %d', res.statusCode);
          debug('Headers: %j', res.headers);
      });
      req1.on('error', (e) => {
          debug('problem with request: %o', e.message);
          reject(e);
      });
      const stream1 = bufferToStream(body);
      stream1.pipe(req1);

      stream1.on('end', () => {
          debug('Streaming completed');
          req1.end();
          resolve();
      });

      let options = createRequestOptions(urls.put_url, streamLength(stream1));

      const req2 = http.request(options, (res) => {
        debug('Status: %d', res.statusCode);
        debug('Headers: %j', res.headers);
      });
      req2.on('error', (e) => {
        debug('problem with request: %o', e.message);
        reject(e);
      });
      const stream2 = bufferToStream(body);
      stream2.pipe(req2);

      stream2.on('end', () => {
        debug('Streaming completed');
        req2.end();
        resolve();
      });
      msg.attachments = {};
      msg.attachments[name] = {
        url: urls.get_url,
        size: streamLength(stream2),
        'content-type': contentType
      };
    });
  }

  function bufferToStream(buffer) {
    let stream = new Duplex();
    stream.push(buffer);
    stream.push(null);
    return stream;
  }

  function createRequestOptions(putUrl, contentLength) {
    const opts = url.parse(putUrl);
    opts.method = 'PUT';
    opts.headers = {
      'Content-Length': contentLength
    };
    return opts;
  }
}