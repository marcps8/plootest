export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
    public readonly permanent = false
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class TokenRevokedError extends AppError {
  constructor(detail?: string) {
    super(detail ?? "OAuth token revoked", "token_revoked", 401, true);
  }
}

export class TokenExpiredError extends AppError {
  constructor(detail?: string) {
    super(detail ?? "OAuth token expired", "token_expired", 401, false);
  }
}

export class RateLimitedError extends AppError {
  constructor(
    public readonly retryAfterSeconds: number,
    detail?: string
  ) {
    super(detail ?? "Rate limited by provider", "rate_limited", 429, false);
  }
}

export class ProviderUnavailableError extends AppError {
  constructor(detail?: string) {
    super(detail ?? "Provider unavailable", "provider_unavailable", 503, false);
  }
}

export class NotFoundError extends AppError {
  constructor(resource = "Resource") {
    super(`${resource} not found`, "not_found", 404, true);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, "conflict", 409, true);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, "invalid_payload", 400, true);
  }
}
