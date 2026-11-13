// Mock for @scalar/fastify-api-reference ESM module
module.exports = {
  scalarApiReference: () => ({
    content: () => '<html>mock</html>',
  }),
  default: async (fastify, _options) => {
    fastify.get('/scalar', async (_request, _reply) => {
      return { mock: true };
    });
  },
};
