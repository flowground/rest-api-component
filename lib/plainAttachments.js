const { messages } = require('elasticio-node');

exports.process = async function (msg, cfg) {
    const attachmentClient = new BasicAuthRestClient(this, {
        resourceServerUrl: 'http://api-service.platform.svc.cluster.local:9000',
    }, process.env.ELASTICIO_API_USERNAME, process.env.ELASTICIO_API_KEY);

    const signedUrl = await attachmentClient.makeRequest({
        method: 'POST',
        url: '/v2/resources/storage/signed-url',
    });

    await attachmentClient.makeRequest({
        method: 'PUT',
        url: signedUrl.put_url,
        body: body,
        urlIsSegment: false,
    });

    const resultMessage = messages.newEmptyMessage();
    resultMessage.attachments[msg.body.isin] = signedUrl.put_url;
    resultMessage.body.filename = msg.body.isin;
    resultMessage.body.fetchedUrl = msg.body.isin;
    this.emit('data', resultMessage);
};
