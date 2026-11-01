// Thrown when an upstream REST call fails; carries a status/code for GraphQL error mapping.
// `message` is always client-safe: upstream 4xx domain messages, or a generic text otherwise.
export class UpstreamHttpError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'UpstreamHttpError';
  }
}
