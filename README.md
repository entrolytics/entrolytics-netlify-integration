<div align="center">
- <img src="https://raw.githubusercontent.com/entrolytics/.github/main/media/entrov2.png" alt="Entrolytics" width="64" height="64">

[![npm](https://img.shields.io/npm/v/@entrolytics/netlify-plugin.svg?logo=npm)](https://www.npmjs.com/package/@entrolytics/netlify-plugin)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![Netlify](https://img.shields.io/badge/Netlify-Build%20Plugin-00C7B7.svg?logo=netlify\&logoColor=white)](https://www.netlify.com/)

</div>

---

## Overview

**@entrolytics/netlify-plugin** is the official Netlify Build Plugin for Entrolytics - first-party growth analytics for the edge. Automatically inject analytics tracking into your Netlify sites.

**Why use this plugin?**

- One-click install from Netlify UI
- Automatic script injection into all HTML files
- Optional Edge Function for server-side tracking
- Works with any static site generator

## Key Features

<table>
<tr>
<td width="50%">

### Analytics

- Automatic page view tracking
- Cross-domain tracking support
- Privacy-focused with DNT respect
- Edge function geo-data extraction

</td>
<td width="50%">

### Developer Experience

- Netlify UI or netlify.toml setup
- Environment variable configuration
- Edge function deployment
- Works with Hugo, Jekyll, Eleventy, etc.

</td>
</tr>
</table>

## Quick Start

<table>
<tr>
<td align="center" width="25%">
<img src="https://api.iconify.design/lucide:download.svg?color=%236366f1" width="48"><br>
<strong>1. Install</strong><br>
Netlify UI or netlify.toml
</td>
<td align="center" width="25%">
<img src="https://api.iconify.design/lucide:code.svg?color=%236366f1" width="48"><br>
<strong>2. Configure</strong><br>
Add Website ID
</td>
<td align="center" width="25%">
<img src="https://api.iconify.design/lucide:rocket.svg?color=%236366f1" width="48"><br>
<strong>3. Deploy</strong><br>
Build and deploy site
</td>
<td align="center" width="25%">
<img src="https://api.iconify.design/lucide:bar-chart-3.svg?color=%236366f1" width="48"><br>
<strong>4. Track</strong><br>
View analytics in dashboard
</td>
</tr>
</table>

## Installation

### Via Netlify UI (Recommended)

1. Go to your Netlify site dashboard
2. Navigate to **Site settings** → **Build & deploy** → **Plugins**
3. Search for "Entrolytics"
4. Click **Install**
5. Add your `ENTROLYTICS_WEBSITE_ID` environment variable

### Via netlify.toml

Add to your `netlify.toml`:

```toml
[[plugins]]
package = "@entrolytics/netlify-plugin"

  [plugins.inputs]
  websiteId = "your-website-id"
```

Or use environment variables:

```toml
[[plugins]]
package = "@entrolytics/netlify-plugin"
```

Then set `ENTROLYTICS_WEBSITE_ID` in your Netlify environment variables.

### Via npm

```bash
npm install -D @entrolytics/netlify-plugin
```

## Configuration

### Plugin Inputs

| Input                | Description                                                 | Default                          |
| -------------------- | ----------------------------------------------------------- | -------------------------------- |
| `websiteId`          | Your Entrolytics website ID                                 | `ENTROLYTICS_WEBSITE_ID` env var |
| `host`               | Entrolytics host URL                                        | `https://entrolytics.click`      |
| `autoTrack`          | Automatically track page views                              | `true`                           |
| `respectDnt`         | Respect Do Not Track setting                                | `false`                          |
| `injectInHead`       | Inject in `<head>` vs before `</body>`                      | `true`                           |
| `domains`            | Comma-separated domains for cross-domain tracking           | -                                |
| `enableEdgeTracking` | Deploy edge function for server-side tracking with geo data | `false`                          |

### Environment Variables

| Variable                 | Description                                                                       |
| ------------------------ | --------------------------------------------------------------------------------- |
| `ENTROLYTICS_WEBSITE_ID` | Your Entrolytics website ID                                                       |
| `ENTROLYTICS_HOST`       | Custom Entrolytics host URL                                                       |
| `ENTROLYTICS_DOMAINS`    | Cross-domain tracking domains                                                     |
| `ENTROLYTICS_EDGE_MODE`  | Edge tracking mode: `auto` (both), `server` (server-only), `client` (client-only) |

### Example Configurations

#### Basic Setup

```toml
[[plugins]]
package = "@entrolytics/netlify-plugin"

  [plugins.inputs]
  websiteId = "abc123-def456"
```

#### Self-Hosted Instance

```toml
[[plugins]]
package = "@entrolytics/netlify-plugin"

  [plugins.inputs]
  websiteId = "abc123-def456"
  host = "https://analytics.yourdomain.com"
```

#### Privacy-Focused Configuration

```toml
[[plugins]]
package = "@entrolytics/netlify-plugin"

  [plugins.inputs]
  websiteId = "abc123-def456"
  respectDnt = true
  autoTrack = false
```

#### Cross-Domain Tracking

```toml
[[plugins]]
package = "@entrolytics/netlify-plugin"

  [plugins.inputs]
  websiteId = "abc123-def456"
  domains = "example.com,blog.example.com,shop.example.com"
```

#### Edge Function Tracking (Advanced) 🚀

Enable server-side tracking with **sub-50ms latency** and automatic geo data extraction:

```toml
[[plugins]]
package = "@entrolytics/netlify-plugin"

  [plugins.inputs]
  websiteId = "abc123-def456"
  enableEdgeTracking = true
```

This deploys a Netlify Edge Function that:

- **Uses canonical endpoint** (`/collect`) for edge-to-edge communication
- Tracks page views at the edge (before your origin server)
- Extracts geo data from Netlify headers (country, region, city, lat/long)
- Provides **10-50ms response times globally** (vs 50-150ms for origin tracking)
- Works alongside client-side tracking for comprehensive analytics

**Environment Variables for Edge Function:**

```bash
ENTROLYTICS_WEBSITE_ID=abc123-def456
ENTROLYTICS_HOST=https://entrolytics.click  # Optional: self-hosted instance

ENTROLYTICS_EDGE_MODE=auto  # Options: auto (default), server, client

```

**Edge Modes:**

- `auto` - Both server-side (edge) and client-side tracking
- `server` - Server-side tracking only (edge function)
- `client` - Client-side tracking only (injected script)

## Edge Optimization

When edge tracking is enabled (`enableEdgeTracking: true`), the Netlify Edge Function uses the canonical ingestion endpoint (`/collect`) for optimal performance:

- **Edge-to-Edge Communication**: Netlify Edge → Entrolytics Edge with <50ms latency
- **Global Distribution**: Automatic routing to the nearest edge location
- **Fast Cold Starts**: Optimized for serverless environments
- **Scalability**: Built on both Netlify and Entrolytics edge networks

The edge endpoint is specifically optimized for edge runtime environments and provides:

- 3x faster response times compared to Node.js endpoints
- 10x faster cold starts
- Lower infrastructure costs
- Global availability

**Note**: The edge endpoint uses provider headers for geo data extraction (country, region, city from Netlify context), which is perfect for edge function scenarios.

## How It Works

### Client-Side Tracking (Default)

This plugin runs during the `onPostBuild` lifecycle hook, after your site has been built but before it's deployed. It:

1. Scans the publish directory for all `.html` files
2. Injects the Entrolytics tracking script into each file
3. Skips files that already have the Entrolytics script
4. Reports the number of files processed

The script is injected with the `defer` attribute for optimal performance.

### Edge Function Tracking (Optional)

When `enableEdgeTracking` is enabled, the plugin also:

1. Deploys a Netlify Edge Function to `netlify/edge-functions/entrolytics.js`
2. Configures the edge function to run on all routes (except static assets and API endpoints)
3. Extracts geo data from Netlify Edge headers (`context.geo`)
4. Sends tracking data to Entrolytics with **sub-50ms latency**

The edge function runs **before** your origin server, providing:

- **3x faster** response times (10-50ms vs 50-150ms)
- **10x faster** cold starts (<100ms vs 500ms-2s)
- **50% lower cost** compared to origin-based tracking
- **Global availability** across Netlify's edge network

## Manual Event Tracking

After the plugin injects the script, you can track custom events in your JavaScript:

```javascript
// Track a custom event
window.entrolytics?.track("purchase", {
  revenue: 99.99,
  currency: "USD",
});

// Identify a user
window.entrolytics?.identify("user-123", {
  email: "user@example.com",
  plan: "pro",
});
```

## Framework-Specific Notes

### Static Site Generators

This plugin works great with static site generators like:

- Hugo
- Jekyll
- Eleventy
- Gatsby (static export)
- Next.js (static export)
- Astro (static build)

### Single Page Applications

For SPAs that don't generate multiple HTML files, consider using our framework-specific packages:

- `@entrolytics/react` for React
- `@entrolytics/vue` for Vue
- `@entrolytics/svelte` for Svelte
- `@entrolytics/astro` for Astro

## Troubleshooting

### Script not injected

1. Verify your `websiteId` is correct
2. Check that HTML files exist in your publish directory
3. Look for build logs showing "Entrolytics Analytics Injected"

### Already has Entrolytics message

The plugin skips files that already contain the Entrolytics script to prevent duplicates. If you're manually including the script, the plugin will detect this.

### Build failures

Check that:

- The `websiteId` input or `ENTROLYTICS_WEBSITE_ID` env var is set
- Your publish directory contains valid HTML files

## Local Development

The plugin only runs during Netlify builds. For local development, add the script tag manually to your HTML template or use our framework packages.

## License

MIT License - see [LICENSE](LICENSE) for details.
