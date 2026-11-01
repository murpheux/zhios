// Test-only CommonJS stand-in for content-disposition@3 (ESM-only), which mercurius 16's @fastify/static
// require()s. Node 22 can require(esm) but Jest's module runtime cannot; v1 has the same create() semantics.
const contentDisposition = require('../../../node_modules/content-disposition/index.js');

module.exports = { create: contentDisposition, parse: contentDisposition.parse };
