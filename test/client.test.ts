import { afterEach, describe, expect, it, vi } from "vitest";
import { ShotWolf, ShotWolfError, ShotWolfTimeoutError } from "../src/index.js";

type FetchArgs = { url: string; init: RequestInit };

/** Build a fake fetch returning a queued list of responses, recording calls. */
function fakeFetch(
  responses: Array<{
    status: number;
    body?: unknown;
    headers?: Record<string, string>;
    reject?: Error;
  }>
) {
  const calls: FetchArgs[] = [];
  let i = 0;
  const impl = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const spec = responses[Math.min(i, responses.length - 1)];
    i++;
    if (spec.reject) throw spec.reject;
    return new Response(spec.body === undefined ? null : JSON.stringify(spec.body), {
      status: spec.status,
      headers: { "content-type": "application/json", ...(spec.headers ?? {}) },
    });
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

function client(fetchImpl: typeof fetch, extra = {}) {
  return new ShotWolf({
    apiKey: "sw_live_test",
    fetch: fetchImpl,
    retryBackoffMs: 0,
    ...extra,
  });
}

afterEach(() => vi.restoreAllMocks());

describe("construction", () => {
  it("throws without an api key", () => {
    const prev = process.env.SHOTWOLF_API_KEY;
    delete process.env.SHOTWOLF_API_KEY;
    expect(() => new ShotWolf({ fetch: fakeFetch([]).impl })).toThrow(ShotWolfError);
    if (prev) process.env.SHOTWOLF_API_KEY = prev;
  });

  it("accepts a bare string api key", async () => {
    const { impl, calls } = fakeFetch([{ status: 201, body: { id: 1, status: "done" } }]);
    const sw = new ShotWolf("sw_live_bare");
    // swap in the fake fetch after construction is awkward; reconstruct instead
    const sw2 = new ShotWolf({ apiKey: "sw_live_bare", fetch: impl });
    await sw2.capture({ url: "https://example.com" });
    expect(sw).toBeInstanceOf(ShotWolf);
    expect(calls[0].init.headers).toMatchObject({
      Authorization: "Bearer sw_live_bare",
    });
  });

  it("reads SHOTWOLF_API_KEY from env", async () => {
    process.env.SHOTWOLF_API_KEY = "sw_live_env";
    const { impl, calls } = fakeFetch([{ status: 200, body: { balance_cr: 5 } }]);
    const sw = new ShotWolf({ fetch: impl });
    await sw.account();
    expect(calls[0].init.headers).toMatchObject({ Authorization: "Bearer sw_live_env" });
    delete process.env.SHOTWOLF_API_KEY;
  });
});

describe("capture", () => {
  it("POSTs to /api/v1/captures with a JSON body and returns the response", async () => {
    const { impl, calls } = fakeFetch([
      { status: 201, body: { id: 42, status: "done", image_url: "https://cdn/x.png" } },
    ]);
    const res = await client(impl).capture({ url: "https://example.com", full_page: true });

    expect(calls[0].url).toBe("https://shotwolf.com/api/v1/captures");
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].init.headers).toMatchObject({
      Authorization: "Bearer sw_live_test",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      url: "https://example.com",
      full_page: true,
    });
    expect(res).toEqual({ id: 42, status: "done", image_url: "https://cdn/x.png" });
  });

  it("honours a custom baseUrl", async () => {
    const { impl, calls } = fakeFetch([{ status: 201, body: { id: 1 } }]);
    await client(impl, { baseUrl: "http://localhost:6300/" }).capture({ url: "https://e.com" });
    expect(calls[0].url).toBe("http://localhost:6300/api/v1/captures");
  });

  it("sets Idempotency-Key when provided", async () => {
    const { impl, calls } = fakeFetch([{ status: 201, body: { id: 1 } }]);
    await client(impl).capture({ url: "https://e.com" }, { idempotencyKey: "abc-123" });
    expect(calls[0].init.headers).toMatchObject({ "Idempotency-Key": "abc-123" });
  });
});

describe("errors", () => {
  it("throws ShotWolfError from the error envelope", async () => {
    const { impl } = fakeFetch([
      { status: 402, body: { error: { type: "insufficient_credits", message: "Broke" } } },
    ]);
    await expect(client(impl).capture({ url: "https://e.com" })).rejects.toMatchObject({
      name: "ShotWolfError",
      type: "insufficient_credits",
      status: 402,
      message: "Broke",
    });
  });

  it("carries x-request-id when present", async () => {
    const { impl } = fakeFetch([
      {
        status: 400,
        body: { error: { type: "invalid_params", message: "bad" } },
        headers: { "x-request-id": "req_9" },
      },
    ]);
    await expect(client(impl).capture({ url: "x" })).rejects.toMatchObject({
      requestId: "req_9",
    });
  });
});

describe("retries", () => {
  it("retries on 429 then succeeds", async () => {
    const { impl, calls } = fakeFetch([
      { status: 429, body: { error: { type: "rate_limited", message: "slow" } } },
      { status: 201, body: { id: 7, status: "done" } },
    ]);
    const res = await client(impl).capture({ url: "https://e.com" });
    expect(calls.length).toBe(2);
    expect(res).toMatchObject({ id: 7 });
  });

  it("gives up after maxRetries and throws the last error", async () => {
    const { impl, calls } = fakeFetch([
      { status: 503, body: { error: { type: "render_failed", message: "down" } } },
    ]);
    await expect(
      client(impl, { maxRetries: 1 }).capture({ url: "https://e.com" })
    ).rejects.toMatchObject({ status: 503 });
    expect(calls.length).toBe(2); // initial + 1 retry
  });

  it("does not retry on 400", async () => {
    const { impl, calls } = fakeFetch([
      { status: 400, body: { error: { type: "invalid_params", message: "no" } } },
    ]);
    await expect(client(impl).capture({ url: "x" })).rejects.toMatchObject({ status: 400 });
    expect(calls.length).toBe(1);
  });
});

describe("getScreenshot + waitFor", () => {
  it("GETs a screenshot by id (no body)", async () => {
    const { impl, calls } = fakeFetch([{ status: 200, body: { id: 5, status: "queued" } }]);
    await client(impl).getScreenshot(5);
    expect(calls[0].url).toBe("https://shotwolf.com/api/v1/screenshots/5");
    expect(calls[0].init.method).toBe("GET");
    expect(calls[0].init.body).toBeUndefined();
  });

  it("polls until status is done", async () => {
    const { impl, calls } = fakeFetch([
      { status: 200, body: { id: 5, status: "processing" } },
      { status: 200, body: { id: 5, status: "processing" } },
      { status: 200, body: { id: 5, status: "done", image_url: "https://cdn/y.png" } },
    ]);
    const res = await client(impl).waitFor(5, { intervalMs: 1, timeoutMs: 5000 });
    expect(res).toMatchObject({ status: "done" });
    expect(calls.length).toBe(3);
  });

  it("throws when the shot fails", async () => {
    const { impl } = fakeFetch([{ status: 200, body: { id: 5, status: "failed" } }]);
    await expect(
      client(impl).waitFor(5, { intervalMs: 1, timeoutMs: 5000 })
    ).rejects.toMatchObject({ type: "render_failed" });
  });

  it("times out if never done", async () => {
    const { impl } = fakeFetch([{ status: 200, body: { id: 5, status: "processing" } }]);
    await expect(
      client(impl).waitFor(5, { intervalMs: 5, timeoutMs: 1 })
    ).rejects.toBeInstanceOf(ShotWolfTimeoutError);
  });
});

describe("other endpoints", () => {
  it("mockup POSTs to /api/v1/mockups", async () => {
    const { impl, calls } = fakeFetch([{ status: 201, body: { id: 1 } }]);
    await client(impl).mockup({ url: "https://e.com", frame: "iphone_15_pro" });
    expect(calls[0].url).toBe("https://shotwolf.com/api/v1/mockups");
  });

  it("pdf POSTs to /api/v1/pdf", async () => {
    const { impl, calls } = fakeFetch([{ status: 201, body: { id: 1 } }]);
    await client(impl).pdf({ url: "https://e.com", page_format: "A4" });
    expect(calls[0].url).toBe("https://shotwolf.com/api/v1/pdf");
  });

  it("diff POSTs to /api/v1/diffs", async () => {
    const { impl, calls } = fakeFetch([{ status: 201, body: { id: 1, passed: true } }]);
    await client(impl).diff({ before_url: "https://a.com", after_url: "https://b.com" });
    expect(calls[0].url).toBe("https://shotwolf.com/api/v1/diffs");
  });

  it("batch POSTs to /api/v1/capture/batch", async () => {
    const { impl, calls } = fakeFetch([{ status: 201, body: { batch_id: "b1", screenshots: [] } }]);
    await client(impl).batch({ url: "https://e.com", devices: ["default", "iphone_15_pro"] });
    expect(calls[0].url).toBe("https://shotwolf.com/api/v1/capture/batch");
  });

  it("og POSTs to /api/v1/og", async () => {
    const { impl, calls } = fakeFetch([{ status: 201, body: { id: 1 } }]);
    await client(impl).og({ template: "blog_card", variables: { title: "Hi" } });
    expect(calls[0].url).toBe("https://shotwolf.com/api/v1/og");
  });

  it("account GETs /api/v1/account", async () => {
    const { impl, calls } = fakeFetch([{ status: 200, body: { email: "a@b.co", balance_cr: 5 } }]);
    const acc = await client(impl).account();
    expect(calls[0].url).toBe("https://shotwolf.com/api/v1/account");
    expect(acc).toMatchObject({ balance_cr: 5 });
  });
});
