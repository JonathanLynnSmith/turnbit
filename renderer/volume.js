// Node compatibility; browser imports the application primitive in bootstrap.mjs.
if (typeof module !== 'undefined')
  module.exports = require('../src/core/value-control');
