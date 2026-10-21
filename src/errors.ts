import type { ErrorType } from "./types.js";

/**
 * Thrown for any non-2xx API response. `type` mirrors the API error envelope
 * (`invalid_params`, `insufficient_credits`, `rate_limited`, ...). `status` is
 * the HTTP status code.
 */
export class ShotWolfError extends Error {
  readonly type: ErrorType;
  readonly status: number;
  readonly requestId?: string;
  readonly retryAfter?: number;

  constructor(
    message: string,
    opts: {
      type?: ErrorType;
      status: number;
      requestId?: string;
      retryAfter?: number;
    }
  ) {
    super(message);
    this.name = "ShotWolfError";
    this.type = opts.type ?? "unknown";
    this.status = opts.status;
    this.requestId = opts.requestId;
    this.retryAfter = opts.retryAfter;
    Object.setPrototypeOf(this, ShotWolfError.prototype);
  }
}

/** Thrown when a request exceeds the configured timeout. */
export class ShotWolfTimeoutError extends ShotWolfError {
  constructor(timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms`, {
      type: "timeout",
      status: 0,
    });
    this.name = "ShotWolfTimeoutError";
    Object.setPrototypeOf(this, ShotWolfTimeoutError.prototype);
  }
}
