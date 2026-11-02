'use strict';
/* Vercel serverless entry: vercel.json rewrites every path here. */
const config = require('../src/config');
const { createApp } = require('../src/app');

const cfg = config.load();
const problems = config.validate(cfg);
module.exports = problems.length
  ? (req, res) => { res.statusCode = 500; res.setHeader('Content-Type', 'text/plain; charset=utf-8'); res.end('Not configured yet. Set these environment variables:\n - ' + problems.join('\n - ')); }
  : createApp(cfg);
