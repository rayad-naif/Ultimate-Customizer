'use strict';
/* The five apps. Each is its own HighLevel Marketplace listing served under
   its own path on the shared domain: https://<domain>/<slug>/... */
module.exports = [
  require('./lead-scorer'),
  require('./round-robin'),
  require('./contact-cleaner'),
  require('./after-hours'),
  require('./birthday')
];
