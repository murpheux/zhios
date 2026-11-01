// No graphql-request import here, so errors/send-flow stay loadable without the (ESM-only) transport.

/** Codes the gateway puts in `errors[].extensions.code`, plus client-side ones (NETWORK_ERROR, UNKNOWN). */
export type ZumaErrorCode =
  | "INSUFFICIENT_FUNDS"
  | "WALLET_NOT_ACTIVE"
  | "IDEMPOTENCY_CONFLICT"
  | "VALIDATION_ERROR"
  | "BAD_USER_INPUT"
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR"
  | "NETWORK_ERROR"
  | "UNKNOWN";

export interface ZumaGraphQLErrorInfo {
  message: string;
  code?: string;
  path?: ReadonlyArray<string | number>;
}

/**
 * Normalized gateway failure. `message` is the server's client-safe message
 * (the gateway never leaks internals); `code` is `extensions.code` of the
 * first GraphQL error, or NETWORK_ERROR / UNKNOWN for transport failures.
 */
export class ZumaApiError extends Error {
  /** A ZumaErrorCode, or any other code a newer gateway may introduce. */
  readonly code: string;
  readonly statusCode?: number;
  readonly errors: ZumaGraphQLErrorInfo[];

  constructor(
    message: string,
    options: {
      code: string;
      statusCode?: number;
      errors?: ZumaGraphQLErrorInfo[];
      cause?: unknown;
    }
  ) {
    super(message, { cause: options.cause });
    this.name = "ZumaApiError";
    this.code = options.code;
    this.statusCode = options.statusCode;
    this.errors = options.errors ?? [];
  }
}

interface ClientErrorLike {
  response: {
    status?: number;
    errors?: Array<{ message?: unknown; path?: unknown; extensions?: { code?: unknown; statusCode?: unknown } }>;
  };
}

// Duck-typed rather than `instanceof ClientError` so it survives module mocks / duplicate copies.
function isClientError(err: unknown): err is ClientErrorLike {
  return typeof err === "object" && err !== null && "response" in err && typeof err.response === "object";
}

function codeForStatus(status: number | undefined): ZumaErrorCode {
  if (status === 401) return "UNAUTHORIZED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 429) return "RATE_LIMITED";
  if (status !== undefined && status >= 500) return "INTERNAL_ERROR";
  return "UNKNOWN";
}

/** Converts anything graphql-request (or fetch) throws into a ZumaApiError. */
export function toZumaApiError(err: unknown): ZumaApiError {
  if (err instanceof ZumaApiError) return err;
  if (isClientError(err)) {
    const errors: ZumaGraphQLErrorInfo[] = (err.response.errors ?? []).map((e) => ({
      message: typeof e.message === "string" ? e.message : "Request failed",
      code: typeof e.extensions?.code === "string" ? e.extensions.code : undefined,
      path: Array.isArray(e.path) ? (e.path as Array<string | number>) : undefined,
    }));
    const first = errors[0];
    const extStatus = err.response.errors?.[0]?.extensions?.statusCode;
    const statusCode = typeof extStatus === "number" ? extStatus : err.response.status;
    // GraphQL validation errors (no extensions.code) mean the client and SDL disagree.
    const code = first?.code ?? (first ? "BAD_REQUEST" : codeForStatus(err.response.status));
    return new ZumaApiError(first?.message ?? "zuma gateway request failed", {
      code,
      statusCode,
      errors,
      cause: err,
    });
  }
  return new ZumaApiError("Unable to reach the zuma gateway", { code: "NETWORK_ERROR", cause: err });
}
