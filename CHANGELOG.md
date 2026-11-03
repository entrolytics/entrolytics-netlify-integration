# Changelog

## Unreleased

### Fixed

- The edge function took the session id from an `entrolytics_sid` cookie it set on every response,
  and a request without it started a new session. The session id is now derived from the visitor's
  IP address and user agent per 30-minute UTC window, cookieless like the visitor id, and the
  session cookie is no longer set.
