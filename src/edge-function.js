/**
 * Netlify Edge Function for Entrolytics Server-Side Tracking
 *
 * This edge function runs on every request and can:
 * 1. Extract geo data from Netlify Edge headers
 * 2. Track server-side events with sub-50ms latency
 * 3. Forward requests to your origin
 *
 * Deploy: This file is automatically deployed by the Netlify build plugin
 * when enableEdgeTracking is set to true.
 */

const DEFAULT_HOST = "https://api.entrolytics.click";
const VISITOR_COOKIE_NAME = "entrolytics_vid";
const VISITOR_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
const SESSION_WINDOW_MS = 30 * 60 * 1000;

function createUuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const rand = Math.floor(Math.random() * 16);
    const value = char === "x" ? rand : (rand & 0x3) | 0x8;
    return value.toString(16);
  });
}

function parseCookies(header) {
  if (!header) {
    return {};
  }

  return header.split(";").reduce((cookies, part) => {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (!rawKey || rawValue.length === 0) {
      return cookies;
    }

    cookies[rawKey] = decodeURIComponent(rawValue.join("="));
    return cookies;
  }, {});
}

function buildCookie(name, value, secure, maxAge) {
  const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/", "SameSite=Lax"];
  if (typeof maxAge === "number") {
    parts.push(`Max-Age=${maxAge}`);
  }
  if (secure) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

async function hmacUuid(apiKey, message) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(apiKey),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes.slice(0, 16), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * A site-scoped visitor id that rotates at midnight UTC, derived from the visitor's IP address and
 * user agent.
 *
 * A new random id for every request without a visitor cookie counted each such request as a new
 * visitor. The API identifies browser visitors the same way, with a daily keyed hash and no
 * cookie. The key is the API key, so the id cannot be recomputed from an IP address and user
 * agent alone.
 */
function deriveVisitorId(apiKey, websiteId, ip, userAgent, now) {
  const day = now.toISOString().slice(0, 10);
  return hmacUuid(apiKey, `${websiteId}\u0000${day}\u0000${ip}\u0000${userAgent}`);
}

/**
 * A session id for the visitor's 30-minute UTC window (starting on the hour and the half hour),
 * derived like the visitor id from the IP address and user agent, with no cookie. A visit that
 * crosses a window boundary counts as two sessions.
 */
function deriveSessionId(apiKey, websiteId, ip, userAgent, now) {
  const slot = new Date(Math.floor(now.getTime() / SESSION_WINDOW_MS) * SESSION_WINDOW_MS)
    .toISOString()
    .slice(0, 16);
  return hmacUuid(apiKey, `${websiteId}\u0000session\u0000${slot}\u0000${ip}\u0000${userAgent}`);
}

async function getTrackingIds(request, context, apiKey, websiteId) {
  const cookies = parseCookies(request.headers.get("cookie") || "");
  const secure = new URL(request.url).protocol === "https:";
  const ip = context.ip || "";
  const userAgent = request.headers.get("user-agent") || "";
  const known = Boolean(ip || userAgent);
  const now = new Date();

  const cookieVisitorId = cookies[VISITOR_COOKIE_NAME];
  const visitorId =
    cookieVisitorId ||
    (known ? await deriveVisitorId(apiKey, websiteId, ip, userAgent, now) : createUuid());
  // How long visitorId identifies the visitor; the API's retention report counts only persistent
  // ids. The year-long cookie is persistent, the derived id rotates daily, and a random id has no
  // defined lifetime.
  const visitorIdScope = cookieVisitorId ? "persistent" : known ? "daily" : undefined;
  const sessionId = known
    ? await deriveSessionId(apiKey, websiteId, ip, userAgent, now)
    : createUuid();
  const setCookies = [];

  if (!cookies[VISITOR_COOKIE_NAME]) {
    setCookies.push(buildCookie(VISITOR_COOKIE_NAME, visitorId, secure, VISITOR_COOKIE_MAX_AGE));
  }

  return { visitorId, visitorIdScope, sessionId, setCookies };
}

/**
 * Extract geo data from Netlify Edge context
 */
function extractGeoData(context) {
  const { geo } = context;

  return {
    country: geo?.country?.code,
    region: geo?.subdivision?.code,
    city: geo?.city,
    latitude: geo?.latitude,
    longitude: geo?.longitude,
  };
}

/**
 * Send tracking event to Entrolytics
 */
async function trackEvent(options, context, request, trackingIds) {
  const { websiteId, apiKey, host = DEFAULT_HOST } = options;

  if (!apiKey) {
    console.warn("Entrolytics: ENTROLYTICS_API_KEY not set, skipping edge tracking");
    return;
  }

  const geo = extractGeoData(context);
  const url = new URL(request.url);
  const referrer = request.headers.get("referer") || "";
  const normalizedReferrer =
    referrer.startsWith("http://") || referrer.startsWith("https://") ? referrer : undefined;

  const payload = {
    websiteId,
    eventId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    sessionId: trackingIds.sessionId,
    visitorId: trackingIds.visitorId,
    ...(trackingIds.visitorIdScope && { visitorIdScope: trackingIds.visitorIdScope }),
    url: url.toString(),
    eventType: "pageview",
    ...(normalizedReferrer && { referrer: normalizedReferrer }),
    properties: {
      server: true,
      geo,
      hostname: url.hostname,
      language: request.headers.get("accept-language")?.split(",")[0] || "",
    },
  };

  try {
    const trackingUrl = `${host.replace(/\/$/, "")}/collect`;

    // Use fetch with short timeout - don't block the response
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1000);

    fetch(trackingUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "User-Agent": "Netlify-Edge-Function",
        // The API attributes and bot-screens the visitor only from these headers.
        ...(request.headers.get("user-agent") && {
          "X-Forwarded-User-Agent": request.headers.get("user-agent"),
        }),
        ...(context.ip && { "X-Forwarded-For": context.ip }),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
      .catch((error) => {
        console.warn("Entrolytics tracking transport error:", error?.message || error);
      })
      .finally(() => clearTimeout(timeoutId));
  } catch (error) {
    console.warn("Entrolytics tracking setup error:", error?.message || error);
  }
}

export default async function (request, context) {
  // Get configuration from environment variables
  const websiteId = Deno.env.get("ENTROLYTICS_WEBSITE_ID");
  const apiKey = Deno.env.get("ENTROLYTICS_API_KEY");
  const host = Deno.env.get("ENTROLYTICS_HOST") || DEFAULT_HOST;
  const trackingMode = Deno.env.get("ENTROLYTICS_EDGE_MODE") || "auto";

  if (!websiteId) {
    console.warn("Entrolytics: ENTROLYTICS_WEBSITE_ID not set, skipping edge tracking");
    return context.next();
  }

  if (!apiKey) {
    console.warn("Entrolytics: ENTROLYTICS_API_KEY not set, skipping edge tracking");
    return context.next();
  }

  const url = new URL(request.url);
  const trackingIds = await getTrackingIds(request, context, apiKey, websiteId);

  // Skip tracking for:
  // - Static assets (images, CSS, JS, fonts)
  // - API routes
  // - Netlify internal routes
  const skipExtensions = [
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".svg",
    ".ico",
    ".css",
    ".js",
    ".woff",
    ".woff2",
    ".ttf",
    ".eot",
    ".map",
  ];
  const shouldSkip =
    skipExtensions.some((ext) => url.pathname.endsWith(ext)) ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/.netlify/") ||
    url.pathname.startsWith("/_next/");

  if (!shouldSkip) {
    // Track page view (non-blocking)
    const options = { websiteId, apiKey, host };

    // Fire and forget - don't await
    if (trackingMode === "auto" || trackingMode === "server") {
      trackEvent(options, context, request, trackingIds).catch(() => {});
    }
  }

  // Always forward the request to origin
  const response = await context.next();
  const headers = new Headers(response.headers);

  for (const cookie of trackingIds.setCookies) {
    headers.append("Set-Cookie", cookie);
  }

  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

// Edge function configuration
export const config = {
  path: "/*",
  excludedPath: [
    "/api/*",
    "/.netlify/*",
    "/_next/*",
    "/*.{jpg,jpeg,png,gif,svg,ico,css,js,woff,woff2,ttf,eot,map}",
  ],
};
