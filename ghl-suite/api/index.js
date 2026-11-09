'use strict';
/* Vercel entry: vercel.json rewrites every path here; Express routes it. */
const config = require('../src/config');
const { createSuite } = require('../src/suite');

const cfg = config.load();
const problems = config.validate(cfg);
let handler;
if (problems.length) {
  console.error('Configuration problems: ' + problems.join('; '));
  handler = (req, res) => {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('The app suite is not configured yet. Set these environment variables in Vercel:\n - ' + problems.join('\n - '));
  };
} else {
  handler = createSuite(cfg);
}
module.exports = handler;
