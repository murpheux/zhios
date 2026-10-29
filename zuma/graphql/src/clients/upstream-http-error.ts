// Thrown when an upstream REST service returns a non-2xx response; carries the status for GraphQL error mapping.
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
