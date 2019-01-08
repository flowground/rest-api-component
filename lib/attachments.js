const client = require('elasticio-rest-node')();
const url = require('url');
const debug = require('debug')('attachment');
const http = require('http');
const Duplex = require('stream').Duplex;

exports.addAttachment = addAttachment;

function addAttachment(msg, name, body, contentLength, contentType) {
  return getUrls().then(result => {
    debug('createSignedUrl result: %j', result);
    debug('Uploading to url: %s', result.put_url);
    debug('Content-Type: %s', contentType);
    if(contentType === 'application/xml') {
        return uploadXml(result);
    }
    else {
        return uploadFile(result, contentLength, contentType);
    }
  });


  function getUrls() {
    return client.resources.storage.createSignedUrl();
  }

  function uploadFile(urls, contentLength, contentType) {
    let msgLength = body.length;
    let options = createRequestOptions(urls.put_url, msgLength);
    return new Promise(async (resolve, reject) => {
      const req = http.request(options, (res) => {
        debug('Status: %d', res.statusCode);
        debug('Headers: %j', res.headers);
      });
      req.on('error', (e) => {
        debug('problem with request: %o', e.message);
        reject(e);
      });
      const stream = await bufferToStream(body);
      await stream.pipe(req);

      stream.on('end', async () => {
        debug('Streaming completed');
        await req.end();
        resolve();
      });
      msg.attachments = {};
      msg.attachments[name] = {
        url: urls.get_url,
        size: msgLength,
        'content-type': contentType
      };
    });
  }

  function uploadXml(urls) {
      let opts = url.parse(urls.put_url);
      opts.method = 'PUT';
      opts.body = body;
      opts.headers = {
          'Content-Length': body.length,
          'Content-Type': 'multipart/form-data'
      };
      return new Promise(async (resolve, reject) => {
          const req = http.request(options, (res) => {
              debug('Status: %d', res.statusCode);
              debug('Headers: %j', res.headers);
          });
      });
  }

  async function bufferToStream(buffer) {
    let stream = new Duplex();
    await stream.push(buffer);
    await stream.push(null);
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