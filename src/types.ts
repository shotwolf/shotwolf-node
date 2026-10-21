// Types mirror config/openapi.yaml (ShotWolf API v1.0.0). Keep in sync.

export type Device =
  | "default"
  | "iphone_15_pro"
  | "pixel_8_pro"
  | "macbook_air"
  | "ipad_pro_12_9";

export type ImageFormat = "png" | "jpg" | "jpeg" | "webp";
export type CaptureFormat = ImageFormat | "gif" | "mp4";

export type MockupFrame =
  | "iphone_15_pro"
  | "pixel_8_pro"
  | "macbook_air"
  | "ipad_pro_12_9"
  | "browser_macos"
  | "browser_chrome"
  | "instagram_post"
  | "instagram_profile"
  | "facebook_ad"
  | "google_display_ad"
  | "linkedin_ad";

export type MockupBg =
  | "black"
  | "white"
  | "grey"
  | "lime"
  | "orange"
  | "blue"
  | "pink"
  | "purple"
  | "gradient";

export type OgTemplate = "blog_card" | "product_card" | "quote_card" | "minimal";

export type PageFormat =
  | "Letter"
  | "Legal"
  | "Tabloid"
  | "Ledger"
  | "A0"
  | "A1"
  | "A2"
  | "A3"
  | "A4"
  | "A5"
  | "A6";

export type Tier = "cub" | "pup" | "wolf" | "alpha" | "pack";

export type ErrorType =
  | "invalid_params"
  | "insufficient_credits"
  | "url_blocked"
  | "render_failed"
  | "unauthorized"
  | "rate_limited"
  | string;

export interface ScriptedAction {
  type:
    | "click"
    | "fill"
    | "type"
    | "press"
    | "hover"
    | "scroll"
    | "scroll_to"
    | "wait"
    | "wait_for"
    | "screenshot";
  selector?: string;
  value?: string;
  key?: string;
  delay?: number;
  ms?: number;
  y?: number;
  direction?: "up" | "down";
  timeout_ms?: number;
  mask_in_logs?: boolean;
  state?: "attached" | "detached" | "visible" | "hidden";
  button?: "left" | "right" | "middle";
  click_count?: 1 | 2 | 3;
}

/** At least one of `url` or `html` is required (mutually exclusive). */
export interface CaptureParams {
  url?: string;
  html?: string;
  device?: Device;
  format?: CaptureFormat;
  full_page?: boolean;
  dark_mode?: boolean;
  delay_ms?: number;
  wait_for_selector?: string;
  block_ads?: boolean;
  block_cookies?: boolean;
  dismiss_cookies?: boolean;
  block_trackers?: boolean;
  selector?: string;
  user_agent?: string;
  quality?: number;
  cache_ttl?: number;
  webhook_url?: string;
  on_action_error?: "fail" | "continue";
  duration?: number;
  fps?: 10 | 15 | 24;
  scroll?: "smooth" | "none" | "steps";
  actions?: ScriptedAction[];
  storage?: "s3";
  storage_endpoint?: string;
  storage_bucket?: string;
  storage_key?: string;
  storage_access_key_id?: string;
  storage_secret_access_key?: string;
  storage_region?: string;
  storage_acl?: "private" | "public-read";
  storage_class?: string;
}

export interface CaptureResponse {
  id: number;
  status: "done" | "queued" | "processing" | "failed";
  source_url?: string;
  device?: string | null;
  format?: string;
  mime_type?: string;
  size_bytes?: number;
  width_px?: number;
  height_px?: number;
  render_ms?: number;
  credits_used?: number;
  balance_after_cr?: number;
  tier?: Tier;
  cached?: boolean;
  created_at?: string;
  share_token?: string;
  image_url?: string | null;
}

export interface CaptureAsyncResponse {
  id: number;
  status: "queued";
  source_url?: string;
  device?: string;
  format?: string;
  share_token?: string;
  webhook_url?: string | null;
  image_url: null;
}

export interface BatchParams {
  url: string;
  devices: Device[];
  format?: ImageFormat;
  full_page?: boolean;
  dark_mode?: boolean;
  delay_ms?: number;
}

export interface BatchScreenshot {
  id: number;
  status: "done" | "failed";
  device: string;
  format: string;
  mime_type?: string;
  size_bytes?: number;
  width_px?: number;
  height_px?: number;
  render_ms?: number;
  error?: string | null;
  share_token?: string;
  image_url?: string | null;
}

export interface BatchResponse {
  batch_id: string;
  screenshots: BatchScreenshot[];
  credits_used: number;
  balance_after_cr: number;
  tier?: Tier;
}

export interface MockupParams {
  url: string;
  frame: MockupFrame;
  bg?: MockupBg;
  format?: ImageFormat;
  full_page?: boolean;
  dark_mode?: boolean;
  delay_ms?: number;
}

export interface OgParams {
  template: OgTemplate;
  variables?: Record<string, string>;
  format?: ImageFormat;
}

export interface PdfMargin {
  top?: string;
  right?: string;
  bottom?: string;
  left?: string;
}

/** At least one of `url` or `html` is required. */
export interface PdfParams {
  url?: string;
  html?: string;
  page_format?: PageFormat;
  landscape?: boolean;
  print_background?: boolean;
  scale?: number;
  delay_ms?: number;
  margin?: PdfMargin;
}

export interface IgnoreRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DiffParams {
  before_url?: string;
  after_url?: string;
  before_image_url?: string;
  after_image_url?: string;
  before_screenshot_id?: number;
  after_screenshot_id?: number;
  device?: Device;
  full_page?: boolean;
  dark_mode?: boolean;
  delay_ms?: number;
  wait_for_selector?: string;
  threshold?: number;
  include_aa_in_diff?: boolean;
  ignore_regions?: IgnoreRegion[];
}

export interface DiffRegion extends IgnoreRegion {
  pixel_count: number;
}

export interface DiffResponse {
  id: number;
  status: "done";
  diff_image_url: string;
  diff_ratio: number;
  diff_pixels: number;
  total_pixels: number;
  passed: boolean;
  regions: DiffRegion[];
  width: number;
  height: number;
  render_ms: number;
  before_screenshot_id: number | null;
  after_screenshot_id: number | null;
  credits_used: number;
  balance_after_cr: number;
  tier: string;
  share_token: string;
}

export interface AccountResponse {
  id: number;
  email_address: string;
  api_key: {
    prefix: string;
    name: string;
  };
  balance_cr: number;
  monthly_usage_cr: number;
  tier: {
    name: Tier;
    discount: number;
  };
  webhook_secret: string;
}

export interface ErrorEnvelope {
  error: {
    type: ErrorType;
    message: string;
  };
}

export interface ShotWolfOptions {
  /** API key, `sw_live_...`. Falls back to `process.env.SHOTWOLF_API_KEY`. */
  apiKey?: string;
  /** Base URL. Defaults to https://shotwolf.com */
  baseUrl?: string;
  /** Per-request timeout in ms. Default 60000. */
  timeout?: number;
  /** Retries on 429 / 5xx. Default 2. */
  maxRetries?: number;
  /** Base backoff in ms (doubled per attempt). Default 500. */
  retryBackoffMs?: number;
  /** Injectable fetch, primarily for testing. Defaults to global fetch. */
  fetch?: typeof fetch;
}

export interface RequestOptions {
  /** Sets the `Idempotency-Key` header on money POST endpoints. */
  idempotencyKey?: string;
  /** Overrides the client timeout for this call. */
  timeout?: number;
}

export interface WaitForOptions {
  /** Poll interval in ms. Default 2000. */
  intervalMs?: number;
  /** Give up after this many ms. Default 120000. */
  timeoutMs?: number;
}
