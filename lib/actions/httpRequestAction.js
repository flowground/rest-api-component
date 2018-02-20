"use strict";

const request = require('request');
const messages = require('elasticio-node').messages;

exports.process = processAction;

// processAction({
//         messageType: 'ack',
//         status: 'requestReceived',
//         message: 'some message',
//         workautomationId: "99028bc1-e752-468c-a817-e456c3e2edab"
//     }, {
//         url: 'http://manage.dev1.riversand-dataplatform.com',
//         port: '7075',
//         tenant_id: 'jcpenney',
//         user_id: 'mary.jane@riversand.com',
//         channel: 'EIO'
// }).catch(err => {
//     console.log('err.response', err.response);
// });

// async function processAction(msg, cfg) {
//     console.log("11111111111111111111111111111111111111111111111111111111111111");
//     try {
//         console.log("222222222222222222222222222222222222222222222222222222222222");
//         await exec(msg, cfg);
//     } catch (e) {
//         console.error(e);
//     }
// }

function processAction(msg, cfg) {

    const requestOptions = {
        url: getURI(cfg),
        headers: {
            "Content-Type": "application/json",
            "x-rdp-tenantId":cfg.tenant_id,
            "x-rdp-userId":cfg.user_id,
            "x-rdp-userRoles":'["admin"]'
        },
        body: JSON.stringify({
            dataObject: {
              id: msg.workAutomationId,
              dataObjectInfo: {
                dataObjectType: "entityjson"
              },
              properties: {
                createdByService: "user interface",
                createdBy: "user",
                createdDate: "2016-07-16T18:33:52.412-07:00",
                app: "RSConnect",
                service: "ENTITY_EXPORT",
                channel: cfg.channel,
                format: "JSON",
                source: "internal",
                role: "admin",
                user: "system",
                subtype: "System",
                order: 10,
                workAutomationId: msg.workAutomationId,
                messageType: msg.messageType,
                status: msg.status 
              },
              data: {
                message: msg.message
              }
            }
          }),
        JSON: true
    };

    return new Promise((resolve, reject) => {
        request.post(requestOptions, function(error, response, body) {
            if (error) {
                console.log(error);
                return reject(error);
            }
                console.log('response:', body);

                resolve(messages.newMessageWithBody(JSON.parse(body)));

        });
    });
}

function getURI(cfg) {
    return `${cfg.url}:${cfg.port}/${cfg.tenant_id}/api/rsConnectService/status`
}
