const { processMethod } = require('../utils.js');

function processTrigger(msg, cfg) {
  return processMethod.call(this, false, msg, cfg);
}

exports.process = processTrigger;
