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
const SESSION_COOKIE_NAME = "entrolytics_sid";
const VISITOR_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
const SESSION_COOKIE_MAX_AGE = 60 * 30;

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

function getTrackingIds(request) {
  const cookies = parseCookies(request.headers.get("cookie") || "");
  const secure = new URL(request.url).protocol === "https:";

  const visitorId = cookies[VISITOR_COOKIE_NAME] || createUuid();
  const sessionId = cookies[SESSION_COOKIE_NAME] || createUuid();
  const setCookies = [];

  if (!cookies[VISITOR_COOKIE_NAME]) {
    setCookies.push(buildCookie(VISITOR_COOKIE_NAME, visitorId, secure, VISITOR_COOKIE_MAX_AGE));
  }

  setCookies.push(buildCookie(SESSION_COOKIE_NAME, sessionId, secure, SESSION_COOKIE_MAX_AGE));

  return { visitorId, sessionId, setCookies };
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
    url: url.toString(),
    eventType: "pageview",
    ...(normalizedReferrer && { referrer: normalizedReferrer }),
    properties: {
      server: true,
      geo,
      hostname: url.hostname,
      language: request.headers.get("accept-language")?.split(",")[0] || "",
      headers: {
        userAgent: request.headers.get("user-agent") || "",
      },
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
        "User-Agent": request.headers.get("user-agent") || "Netlify-Edge-Function",
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
  const trackingIds = getTrackingIds(request);

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
