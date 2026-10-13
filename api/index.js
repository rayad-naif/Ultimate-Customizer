'use strict';
/* Vercel serverless entry. vercel.json rewrites every path here, and
   Express routes it (req.url keeps the original path). */
const config = require('../server/config');
const { createApp } = require('../server/app');

const cfg = config.load();
const problems = config.validate(cfg);

let handler;
if (problems.length) {
  console.error('Configuration problems: ' + problems.join('; '));
  handler = (req, res) => {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Ultimate Customizer is not configured yet. Set these environment variables in Vercel:\n - ' + problems.join('\n - '));
  };
} else {
  handler = createApp(cfg);
}

module.exports = handler;
