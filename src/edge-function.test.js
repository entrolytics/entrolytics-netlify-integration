import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";

import edgeFunction from "./edge-function.js";

const USER_AGENT = "Mozilla/5.0 (Macintosh) Safari/605.1.15";
const env = {
  ENTROLYTICS_API_KEY: "ent_test",
  ENTROLYTICS_WEBSITE_ID: "6f1c7c8e-5d3b-4f5a-9d1e-2b6f0c9a7e41",
};

async function trackRequest(headers, ip = "203.0.113.7") {
  let resolveSent;
  const sent = new Promise((resolve) => {
    resolveSent = resolve;
  });
  globalThis.fetch = async (url, init) => {
    resolveSent(init);
    return new Response(null, { status: 202 });
  };

  const request = new Request("https://example.test/pricing", { headers });
  const context = { geo: {}, ip, next: async () => new Response("ok") };
  const response = await edgeFunction(request, context);
  const init = await sent;
  return { headers: init.headers, payload: JSON.parse(init.body), response };
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
    // The year-long cookie follows the visitor across weeks, so the retention report counts it.
    assert.equal(payload.visitorIdScope, "persistent");
  });

  it("marks a first visit's id persistent because the response stores it in the cookie", async () => {
    const derived = await trackRequest({ "user-agent": USER_AGENT });
    const unknown = await trackRequest({}, "");

    for (const { payload, response } of [derived, unknown]) {
      assert.equal(payload.visitorIdScope, "persistent");
      assert.match(
        response.headers.get("set-cookie"),
        new RegExp(`entrolytics_vid=${payload.visitorId};`),
      );
      assert.match(response.headers.get("set-cookie"), /Max-Age=31536000/);
    }
  });

  it("keeps the raw IP and user agent out of event properties", async () => {
    const { payload } = await trackRequest({ "user-agent": USER_AGENT });

    const properties = JSON.stringify(payload.properties);
    assert.doesNotMatch(properties, /Mozilla|Safari/);
    assert.doesNotMatch(properties, /203\.0\.113\.7/);
  });

  it("derives one session per visitor per half hour without a session cookie", async () => {
    const sessions = [];
    for (const time of [
      "2026-09-24T14:30:00Z",
      "2026-09-24T14:47:00Z",
      "2026-09-24T14:59:59Z",
      "2026-09-24T15:00:00Z",
    ]) {
      mock.timers.setTime(new Date(time).getTime());
      const { payload, response } = await trackRequest({
        cookie: "entrolytics_sid=0b8f6a52-3c1d-4e7f-8a9b-1c2d3e4f5a6b",
        "user-agent": USER_AGENT,
      });
      sessions.push(payload.sessionId);
      assert.doesNotMatch(response.headers.get("set-cookie") || "", /entrolytics_sid/);
    }

    assert.deepEqual(sessions, [
      "6e75928f-813d-49ee-a4dc-5d2e299d7eb2",
      "6e75928f-813d-49ee-a4dc-5d2e299d7eb2",
      "6e75928f-813d-49ee-a4dc-5d2e299d7eb2",
      "f656564a-ee6c-4cc1-8309-0b69c73bfd3d",
    ]);
  });
});
