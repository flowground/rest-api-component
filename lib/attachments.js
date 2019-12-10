/* eslint-disable no-param-reassign */
const { AttachmentProcessor } = require('@elastic.io/component-commons-library');

async function addAttachment(msg, name, stream, contentLength, contentType) {
  // if flow uses a stub in previous step, or if trigger, msg will not have an attachments property
  if (msg.attachments === undefined) msg.attachments = {};
  const result = await new AttachmentProcessor().uploadAttachment(stream, 'stream');

  msg.attachments[name] = {
    url: result.config.url,
    size: contentLength,
  };

  if (contentType) msg.attachments[name]['content-type'] = contentType;
}

exports.addAttachment = addAttachment;
