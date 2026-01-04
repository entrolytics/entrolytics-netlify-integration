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

const DEFAULT_HOST = 'https://entrolytics.click';

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
async function trackEvent(options, context, request) {
  const { websiteId, host = DEFAULT_HOST } = options;

  const geo = extractGeoData(context);
  const url = new URL(request.url);

  const payload = {
    website: websiteId,
    url: url.pathname + url.search,
    referrer: request.headers.get('referer') || '',
    hostname: url.hostname,
    language: request.headers.get('accept-language')?.split(',')[0] || '',
    screen: '',
    title: '',
    // Server-side tracking metadata
    server: true,
    geo,
    headers: {
      userAgent: request.headers.get('user-agent') || '',
    },
  };

  try {
    // Send to Entrolytics edge collection endpoint for optimal edge-to-edge performance
    // Using /api/send-native for sub-50ms latency on Netlify Edge Functions
    const trackingUrl = `${host.replace(/\/$/, '')}/api/send-native`;

    // Use fetch with short timeout - don't block the response
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1000);

    fetch(trackingUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': request.headers.get('user-agent') || 'Netlify-Edge-Function',
      },
      body: JSON.stringify({ type: 'event', payload }),
      signal: controller.signal,
    })
      .catch(() => {}) // Silently fail - tracking should never break the site
      .finally(() => clearTimeout(timeoutId));
  } catch (error) {
    // Silently fail - tracking should never break the site
    console.error('Entrolytics tracking error:', error.message);
  }
}

export default async function (request, context) {
  // Get configuration from environment variables
  const websiteId = Deno.env.get('ENTROLYTICS_WEBSITE_ID');
  const host = Deno.env.get('ENTROLYTICS_HOST') || DEFAULT_HOST;
  const trackingMode = Deno.env.get('ENTROLYTICS_EDGE_MODE') || 'auto';

  if (!websiteId) {
    console.warn('Entrolytics: ENTROLYTICS_WEBSITE_ID not set, skipping edge tracking');
    return context.next();
  }

  const url = new URL(request.url);

  // Skip tracking for:
  // - Static assets (images, CSS, JS, fonts)
  // - API routes
  // - Netlify internal routes
  const skipExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.ico', '.css', '.js', '.woff', '.woff2', '.ttf', '.eot', '.map'];
  const shouldSkip =
    skipExtensions.some(ext => url.pathname.endsWith(ext)) ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/.netlify/') ||
    url.pathname.startsWith('/_next/');

  if (!shouldSkip) {
    // Track page view (non-blocking)
    const options = { websiteId, host };

    // Fire and forget - don't await
    if (trackingMode === 'auto' || trackingMode === 'server') {
      trackEvent(options, context, request).catch(() => {});
    }
  }

  // Always forward the request to origin
  return context.next();
}

// Edge function configuration
export const config = {
  path: '/*',
  excludedPath: [
    '/api/*',
    '/.netlify/*',
    '/_next/*',
    '/*.{jpg,jpeg,png,gif,svg,ico,css,js,woff,woff2,ttf,eot,map}',
  ],
};
