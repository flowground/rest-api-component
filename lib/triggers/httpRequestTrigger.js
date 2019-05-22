"use strict";

const processMethod = require('../utils.js').processMethod;

exports.process = processTrigger;

function processTrigger(msg, cfg) {
    return processMethod.call(this, false, msg, cfg);
}
