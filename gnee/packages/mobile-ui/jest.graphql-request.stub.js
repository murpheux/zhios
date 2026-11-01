// graphql-request v7 is ESM-only and jest-expo doesn't transform it. Unit tests never hit the
// network (they mock useZuma), so a stub keeps @gnee/api-client importable.
class GraphQLClient {
  request() {
    return Promise.reject(new Error("graphql-request is stubbed in mobile-ui unit tests"));
  }
}
module.exports = { GraphQLClient };
