const { processMethod } = require('../utils.js');

function processTrigger(msg, cfg) {
  return processMethod.call(this, msg, cfg);
}

exports.process = processTrigger;
