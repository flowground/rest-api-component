const request = require('request');

// (async () => {
//     const res = await new Promise((res, rej) => {
//         request.post('http://manage.dev1.riversand-dataplatform.com:7075', (err, res, body) => {
//             console.log('body', body);
//         });
//     });
// })().then(process.exit, console.error);

const opts = {
    uri: 'http://manage.dev1.riversand-dataplatform.com:7075',
    body: JSON.stringify({

    })
}

request.post(opts, (err, res, body) => {
    console.log('err', err);
    console.log('res', res);
    console.log('body', body);
});