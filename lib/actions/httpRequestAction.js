"use strict";

const processMethod = require('../utils.js').processMethod;

exports.process = processAction;

function processAction(msg, cfg) {
    return processMethod.call(this, true, msg, cfg);
}
