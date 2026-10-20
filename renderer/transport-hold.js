// Node compatibility for existing consumers. Browser loading is explicit in bootstrap.mjs.
if (typeof module !== 'undefined')
  module.exports = require('../src/core/transport-hold');
