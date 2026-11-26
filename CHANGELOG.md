# Changelog

## [Unreleased]

### Changed

- Built and released with pnpm 12.24.0. No code changes.

## [3.0.2] - 2026-11-26

### Fixed

- The edge function took the session id from an `entrolytics_sid` cookie it set on every response,
  and a request without it started a new session. The session id is now derived from the visitor's
  IP address and user agent per 30-minute UTC window, cookieless like the visitor id, and the
  session cookie is no longer set.
- Every edge page view sent the visitor's raw user agent in `properties.headers.userAgent`,
  storing it with the event's custom properties. It is no longer sent there; the API still
  receives it in `X-Forwarded-User-Agent` for attribution and bot screening.
- Edge page views did not say how long their `visitorId` identifies the visitor, so the API's
  retention report, which counts only persistent visitor ids, could not use them. They now send
  `visitorIdScope: "persistent"`: the id is always the one in the year-long `entrolytics_vid`
  cookie or, on a first visit, the one the response writes into it.

[Unreleased]: https://github.com/entrolytics/entrolytics-netlify-integration/compare/v3.0.2...HEAD
[3.0.2]: https://github.com/entrolytics/entrolytics-netlify-integration/releases/tag/v3.0.2
