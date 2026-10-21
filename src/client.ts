import { ShotWolfError, ShotWolfTimeoutError } from "./errors.js";
import type {
  AccountResponse,
  BatchParams,
  BatchResponse,
  CaptureAsyncResponse,
  CaptureParams,
  CaptureResponse,
  DiffParams,
  DiffResponse,
  ErrorEnvelope,
  MockupParams,
  OgParams,
  PdfParams,
  RequestOptions,
  ShotWolfOptions,
  WaitForOptions,
} from "./types.js";

const DEFAULT_BASE_URL = "https://shotwolf.com";
const DEFAULT_TIMEOUT = 60_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_BACKOFF_MS = 500;

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export class ShotWolf {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly maxRetries: number;
  private readonly retryBackoffMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ShotWolfOptions | string = {}) {
    const opts: ShotWolfOptions =
      typeof options === "string" ? { apiKey: options } : options;

    const apiKey = opts.apiKey ?? process.env.SHOTWOLF_API_KEY;
    if (!apiKey) {
      throw new ShotWolfError(
        "Missing API key. Pass { apiKey } or set SHOTWOLF_API_KEY.",
        { type: "unauthorized", status: 0 }
      );
    }

    const fetchImpl = opts.fetch ?? globalThis.fetch;
    if (!fetchImpl) {
      throw new ShotWolfError(
        "No fetch available. Use Node 18+ or pass a fetch implementation.",
        { type: "unknown", status: 0 }
      );
    }

    this.apiKey = apiKey;
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.timeout = opts.timeout ?? DEFAULT_TIMEOUT;
    this.maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.retryBackoffMs = opts.retryBackoffMs ?? DEFAULT_BACKOFF_MS;
    this.fetchImpl = fetchImpl;
  }

  /** Capture a URL or HTML synchronously. POST /api/v1/captures */
  capture(params: CaptureParams, options?: RequestOptions): Promise<CaptureResponse> {
    return this.request("POST", "/api/v1/captures", params, options);
  }

  /** Queue a capture and return immediately. POST /api/v1/captures/async */
  captureAsync(
    params: CaptureParams,
    options?: RequestOptions
  ): Promise<CaptureAsyncResponse> {
    return this.request("POST", "/api/v1/captures/async", params, options);
  }

  /** Render the same URL across 2-6 devices. POST /api/v1/capture/batch */
  batch(params: BatchParams, options?: RequestOptions): Promise<BatchResponse> {
    return this.request("POST", "/api/v1/capture/batch", params, options);
  }

  /** Render a URL inside a device/social mockup. POST /api/v1/mockups */
  mockup(params: MockupParams, options?: RequestOptions): Promise<CaptureResponse> {
    return this.request("POST", "/api/v1/mockups", params, options);
  }

  /** Generate an Open Graph card from a template. POST /api/v1/og */
  og(params: OgParams, options?: RequestOptions): Promise<CaptureResponse> {
    return this.request("POST", "/api/v1/og", params, options);
  }

  /** Convert a URL or HTML string to PDF. POST /api/v1/pdf */
  pdf(params: PdfParams, options?: RequestOptions): Promise<CaptureResponse> {
    return this.request("POST", "/api/v1/pdf", params, options);
  }

  /** Pixel-diff two screenshots. POST /api/v1/diffs */
  diff(params: DiffParams, options?: RequestOptions): Promise<DiffResponse> {
    return this.request("POST", "/api/v1/diffs", params, options);
  }

  /** Retrieve a single screenshot by ID. GET /api/v1/screenshots/:id */
  getScreenshot(id: number, options?: RequestOptions): Promise<CaptureResponse> {
    return this.request(
      "GET",
      `/api/v1/screenshots/${encodeURIComponent(id)}`,
      undefined,
      options
    );
  }

  /** Get balance, tier and webhook secret. GET /api/v1/account */
  account(options?: RequestOptions): Promise<AccountResponse> {
    return this.request("GET", "/api/v1/account", undefined, options);
  }

  /**
   * Poll `getScreenshot` until the shot resolves to `done` or `failed`.
   * Resolves with the final `CaptureResponse`; throws `ShotWolfError` if the
   * render fails or the timeout elapses.
   */
  async waitFor(
    id: number,
    options: WaitForOptions = {}
  ): Promise<CaptureResponse> {
    const intervalMs = options.intervalMs ?? 2_000;
    const timeoutMs = options.timeoutMs ?? 120_000;
    const deadline = Date.now() + timeoutMs;

    for (;;) {
      const shot = await this.getScreenshot(id);
      if (shot.status === "done") return shot;
      if (shot.status === "failed") {
        throw new ShotWolfError(`Screenshot ${id} failed to render`, {
          type: "render_failed",
          status: 422,
        });
      }
      if (Date.now() + intervalMs > deadline) {
        throw new ShotWolfTimeoutError(timeoutMs);
      }
      await sleep(intervalMs);
    }
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const timeout = options?.timeout ?? this.timeout;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: "application/json",
      "User-Agent": "shotwolf-node/0.1.0",
    };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (options?.idempotencyKey) {
      headers["Idempotency-Key"] = options.idempotencyKey;
    }

    const payload = body === undefined ? undefined : JSON.stringify(body);

    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      let res: Response;
      try {
        res = await this.fetchImpl(url, {
          method,
          headers,
          body: payload,
          signal: controller.signal,
        });
      } catch (err) {
        clearTimeout(timer);
        if (controller.signal.aborted) {
          lastError = new ShotWolfTimeoutError(timeout);
        } else {
          lastError = err;
        }
        if (attempt < this.maxRetries) {
          await sleep(this.backoff(attempt));
          continue;
        }
        throw lastError;
      }
      clearTimeout(timer);

      if (res.ok) {
        if (res.status === 204) return undefined as T;
        return (await res.json()) as T;
      }

      if (RETRYABLE_STATUSES.has(res.status) && attempt < this.maxRetries) {
        const retryAfter = this.parseRetryAfter(res);
        await sleep(retryAfter ?? this.backoff(attempt));
        continue;
      }

      throw await this.toError(res);
    }

    throw lastError ?? new ShotWolfError("Request failed", { status: 0 });
  }

  private backoff(attempt: number): number {
    return this.retryBackoffMs * 2 ** attempt;
  }

  private parseRetryAfter(res: Response): number | undefined {
    const header = res.headers.get("retry-after");
    if (!header) return undefined;
    const secs = Number(header);
    return Number.isFinite(secs) ? secs * 1000 : undefined;
  }

  private async toError(res: Response): Promise<ShotWolfError> {
    const requestId = res.headers.get("x-request-id") ?? undefined;
    let type: string | undefined;
    let message = `HTTP ${res.status}`;
    try {
      const data = (await res.json()) as Partial<ErrorEnvelope>;
      if (data?.error) {
        type = data.error.type;
        message = data.error.message ?? message;
      }
    } catch {
      // non-JSON body; keep the HTTP status message
    }
    return new ShotWolfError(message, {
      type,
      status: res.status,
      requestId: requestId ?? undefined,
      retryAfter: this.parseRetryAfter(res),
    });
  }
}
