'use strict';
const { createLayout } = require('./layout');
const { createPublicViews } = require('./public');
const { createAppViews } = require('./app');
const { createAdminViews } = require('./admin');

function createViews(brand) {
  const L = createLayout(brand);
  const app = createAppViews(L, brand);
  return Object.assign({ message: L.message }, createPublicViews(L, brand), app, createAdminViews(L, app));
}

module.exports = { createViews };
