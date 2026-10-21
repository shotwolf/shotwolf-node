# ShotWolf Node.js SDK

Official Node.js / TypeScript client for the [ShotWolf](https://shotwolf.com) API - capture screenshots, render device mockups, generate Open Graph cards, convert HTML to PDF, and run pixel-level visual regression diffs through a single JSON HTTP API.

- Zero runtime dependencies (uses native `fetch`, Node 18+)
- First-class TypeScript types for every endpoint
- Built-in retries with backoff, idempotency keys, and an async polling helper
- Ships both ESM and CommonJS builds

## Install

```bash
npm install shotwolf
```

## Quick start

Get an API key at [shotwolf.com/dashboard/api_keys](https://shotwolf.com/dashboard/api_keys).

```ts
import ShotWolf from "shotwolf";

const sw = new ShotWolf({ apiKey: process.env.SHOTWOLF_API_KEY });

const shot = await sw.capture({
  url: "https://example.com",
  full_page: true,
  dismiss_cookies: true,
});

console.log(shot.image_url); // -> https://cdn.shotwolf.com/...
```

You can also pass the key as a bare string, or set `SHOTWOLF_API_KEY` in the
environment and construct with no arguments:

```ts
const sw = new ShotWolf("sw_live_xxx");
// or, reading SHOTWOLF_API_KEY:
const sw = new ShotWolf();
```

## Usage

### Screenshots

```ts
// Sync - returns the image URL inline (~1-4s)
const shot = await sw.capture({ url: "https://stripe.com", device: "iphone_15_pro" });

// Async - queue and poll (or supply webhook_url for a callback)
const queued = await sw.captureAsync({ url: "https://stripe.com" });
const done = await sw.waitFor(queued.id); // polls GET /screenshots/:id until done

// Batch - one page, many viewports (cheaper than N calls)
const batch = await sw.batch({
  url: "https://stripe.com",
  devices: ["default", "iphone_15_pro", "ipad_pro_12_9"],
});
```

### Device & social mockups

```ts
const mockup = await sw.mockup({
  url: "https://stripe.com",
  frame: "macbook_air", // or instagram_post, facebook_ad, linkedin_ad, ...
  bg: "gradient",
});
```

### Open Graph cards

```ts
const og = await sw.og({
  template: "blog_card",
  variables: { title: "Ship faster with ShotWolf", author: "Jane Doe" },
});
```

### HTML / URL to PDF

```ts
const pdf = await sw.pdf({
  html: "<h1>Invoice #42</h1>",
  page_format: "A4",
  print_background: true,
});
```

### Visual regression diff

```ts
const diff = await sw.diff({
  before_url: "https://staging.example.com",
  after_url: "https://example.com",
  ignore_regions: [{ x: 0, y: 0, width: 1280, height: 80 }], // mask a dynamic header
});

if (!diff.passed) {
  console.log(`${(diff.diff_ratio * 100).toFixed(2)}% changed`, diff.diff_image_url);
}
```

### Account balance

```ts
const account = await sw.account();
console.log(account.balance_cr, account.tier.name);
```

## Idempotency

Pass an `idempotencyKey` to make money-charging POSTs safe to retry. A repeat
with the same key and body within 24h replays the original response instead of
charging again.

```ts
await sw.capture(
  { url: "https://example.com" },
  { idempotencyKey: crypto.randomUUID() }
);
```

## Error handling

Any non-2xx response throws a `ShotWolfError` carrying the API error `type`,
HTTP `status`, and `message`.

```ts
import { ShotWolfError } from "shotwolf";

try {
  await sw.capture({ url: "https://example.com" });
} catch (err) {
  if (err instanceof ShotWolfError) {
    if (err.type === "insufficient_credits") {
      // top up at https://shotwolf.com/pricing
    }
    console.error(err.status, err.type, err.message, err.requestId);
  }
}
```

## Configuration

```ts
const sw = new ShotWolf({
  apiKey: "sw_live_xxx",
  baseUrl: "https://shotwolf.com", // override for self-host / testing
  timeout: 60_000,                 // per-request timeout in ms
  maxRetries: 2,                   // retries on 429 / 5xx
  retryBackoffMs: 500,             // base backoff, doubled per attempt
});
```

Retries honor the `Retry-After` header on `429` responses. `4xx` responses
other than `429` are never retried.

## API coverage

| Method | Endpoint |
| --- | --- |
| `capture(params, opts?)` | `POST /api/v1/captures` |
| `captureAsync(params, opts?)` | `POST /api/v1/captures/async` |
| `batch(params, opts?)` | `POST /api/v1/capture/batch` |
| `mockup(params, opts?)` | `POST /api/v1/mockups` |
| `og(params, opts?)` | `POST /api/v1/og` |
| `pdf(params, opts?)` | `POST /api/v1/pdf` |
| `diff(params, opts?)` | `POST /api/v1/diffs` |
| `getScreenshot(id, opts?)` | `GET /api/v1/screenshots/:id` |
| `waitFor(id, opts?)` | polls `getScreenshot` until `done`/`failed` |
| `account(opts?)` | `GET /api/v1/account` |

Full parameter reference: [shotwolf.com/docs](https://shotwolf.com/docs).

## License

MIT
