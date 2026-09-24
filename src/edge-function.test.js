import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";

import edgeFunction from "./edge-function.js";

const USER_AGENT = "Mozilla/5.0 (Macintosh) Safari/605.1.15";
const env = {
  ENTROLYTICS_API_KEY: "ent_test",
  ENTROLYTICS_WEBSITE_ID: "6f1c7c8e-5d3b-4f5a-9d1e-2b6f0c9a7e41",
};

async function trackRequest(headers) {
  let resolveSent;
  const sent = new Promise((resolve) => {
    resolveSent = resolve;
  });
  globalThis.fetch = async (url, init) => {
    resolveSent(init);
    return new Response(null, { status: 202 });
  };

  const request = new Request("https://example.test/pricing", { headers });
  const context = { geo: {}, ip: "203.0.113.7", next: async () => new Response("ok") };
  await edgeFunction(request, context);
  const init = await sent;
  return { headers: init.headers, payload: JSON.parse(init.body) };
}

describe("edge function", () => {
  beforeEach(() => {
    globalThis.Deno = { env: { get: (name) => env[name] } };
    mock.timers.enable({ apis: ["Date"], now: new Date("2026-09-24T08:00:00Z") });
  });

  afterEach(() => {
    mock.timers.reset();
    delete globalThis.Deno;
  });

  it("derives the visitor id like the other server SDKs and forwards the visitor", async () => {
    const { headers, payload } = await trackRequest({ "user-agent": USER_AGENT });

    // Same inputs as the Next.js and Python SDKs' deriveVisitorId / _derive_visitor_id.
    assert.equal(payload.visitorId, "cb36ddfc-3c30-41b4-8d6a-f3928d890509");
    assert.equal(headers["X-Forwarded-User-Agent"], USER_AGENT);
    assert.equal(headers["X-Forwarded-For"], "203.0.113.7");
    assert.notEqual(headers["User-Agent"], USER_AGENT);
  });

  it("keeps the visitor id from the visitor cookie", async () => {
    const visitorId = "0b8f6a52-3c1d-4e7f-8a9b-1c2d3e4f5a6b";
    const { payload } = await trackRequest({
      cookie: `entrolytics_vid=${visitorId}`,
      "user-agent": USER_AGENT,
    });

    assert.equal(payload.visitorId, visitorId);
  });
});
