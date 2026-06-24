/**
 * Typed error hierarchy. Every SDK failure is a `VerixError` (or subclass), so
 * `catch (e) { if (e instanceof VerixError) ... }` always works.
 */

export interface VerixErrorInit {
  status?: number;
  code?: string;
  /** Parsed response body, when available. */
  body?: unknown;
}

export class VerixError extends Error {
  /** HTTP status code, when the error originated from an API response. */
  readonly status?: number;
  /** Stable machine-readable code. */
  readonly code: string;
  /** Raw parsed response body, when available. */
  readonly body?: unknown;

  constructor(message: string, init: VerixErrorInit = {}) {
    super(message);
    this.name = new.target.name;
    this.status = init.status;
    this.code = init.code ?? "verix_error";
    this.body = init.body;
    // Restore prototype chain for instanceof across transpile targets.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** 401 — missing, malformed, or revoked API key. */
export class AuthenticationError extends VerixError {
  constructor(message = "Authentication failed", init: VerixErrorInit = {}) {
    super(message, { ...init, code: "authentication_error" });
  }
}

/** 404 — resource not found (or not owned by the key's project). */
export class NotFoundError extends VerixError {
  constructor(message = "Resource not found", init: VerixErrorInit = {}) {
    super(message, { ...init, code: "not_found" });
  }
}

/** 422 / 400 — invalid request payload. */
export class ValidationError extends VerixError {
  constructor(message = "Validation failed", init: VerixErrorInit = {}) {
    super(message, { ...init, code: "validation_error" });
  }
}

/** 429 — rate limited. */
export class RateLimitError extends VerixError {
  constructor(message = "Rate limit exceeded", init: VerixErrorInit = {}) {
    super(message, { ...init, code: "rate_limit" });
  }
}

/** 5xx and any other non-2xx without a more specific mapping. */
export class ApiError extends VerixError {
  constructor(message = "API error", init: VerixErrorInit = {}) {
    super(message, { ...init, code: "api_error" });
  }
}

/** Map an HTTP status + parsed body to the appropriate typed error. */
export function errorFromResponse(status: number, body: unknown): VerixError {
  const message =
    (body && typeof body === "object" && "error" in body && typeof body.error === "string"
      ? body.error
      : undefined) ?? `Request failed with status ${status}`;

  const init: VerixErrorInit = { status, body };
  switch (status) {
    case 401:
      return new AuthenticationError(message, init);
    case 404:
      return new NotFoundError(message, init);
    case 400:
    case 422:
      return new ValidationError(message, init);
    case 429:
      return new RateLimitError(message, init);
    default:
      return new ApiError(message, init);
  }
}
