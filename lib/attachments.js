const { AttachmentProcessor } = require('@elastic.io/component-commons-library');

async function addAttachment(msg, name, stream, contentLength, contentType) {
  const result = await new AttachmentProcessor().uploadAttachment(stream, 'stream');
  // eslint-disable-next-line no-param-reassign
  msg.attachments[name] = {
    url: result.config.url,
    size: contentLength,
  };
  // eslint-disable-next-line no-param-reassign
  if (contentType) msg.attachments[name]['content-type'] = contentType;
}

exports.addAttachment = addAttachment;
