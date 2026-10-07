# Pulse Security Notes

Phase 3 adds authenticated anonymous sessions, bounded API inputs, protected
mailbox access, authenticated signaling identity, authenticated cleanup, and
basic browser security headers. The following risks are intentionally deferred
to keep this assessment change small and preserve the working product flow.

## Remaining production risks

### Connection-state authorization

The server now authenticates the sender and verifies that the target is online,
but it does not yet persist a full pending/connected pair state machine. A
malicious user with their own valid anonymous session could still send an
`accept`, `decline`, or `end` signal to an unrelated online session and affect
its lightweight `busy` flag. A production version should persist the pending
and active peer relationship and authorize every transition against it.

### Distributed rate limiting

The application enforces body, signaling payload, mailbox, and poll batch
limits. It does not implement an in-memory request limiter because that would
not be reliable across Vercel serverless instances. Production should add
Vercel WAF rate rules or another distributed limiter, especially for join,
poll, and signal traffic.

### Mailbox concurrency

Mailbox reads are bounded, but read-then-delete is not an atomic claim. Two
concurrent authenticated polls could receive the same signal. A larger
production hardening pass should use an atomic delete/returning operation or a
claimed-message design.

### Presence cleanup and scale

Stale presence and signal cleanup still runs during polling. At large scale,
cleanup should move to a scheduled job and peer discovery should use spatial
queries, clustering, or pagination rather than a global capped list.

### WebRTC IP privacy

Pulse intentionally uses direct peer-to-peer WebRTC with a public STUN server.
An accepted peer may learn the other peer's public IP through ICE candidates.
Hiding that information requires managed TURN infrastructure and relay-only ICE,
which is outside this phase.

### Location privacy

The stored coordinate is randomly offset by 1–3 km, but online dots remain
globally enumerable and stable for the session. Production privacy work may
include lower coordinate precision, regional queries, and clearer disclosure.

### Content Security Policy

This phase adds conservative headers but intentionally does not add an untested
CSP. A production CSP must be verified with Next.js hydration, Mapbox styles,
tiles, fonts, workers, and WebRTC behavior before enforcement.

### Mapbox token operations

`NEXT_PUBLIC_MAPBOX_TOKEN` is intentionally browser-visible. Production should
use a dedicated public token with only the necessary read scopes and URL
restrictions for the deployed domain. Secret Mapbox tokens must never use the
`NEXT_PUBLIC_` prefix.

### Database transport configuration

`DATABASE_URL` remains server-only. The current PostgreSQL driver warns that
the meaning of some SSL mode aliases will change in its next major release.
Production should explicitly require certificate verification (for example,
the provider-supported equivalent of `sslmode=verify-full`) and keep database
credentials out of `NEXT_PUBLIC_` variables and application logs.

### Legacy presence rows during migration

The authentication migration adds `tokenHash` as nullable so it can be deployed
without deleting active ephemeral rows. Pre-migration rows cannot authenticate
and will expire through the existing short presence TTL. A later maintenance
migration may make the column non-null once legacy rows are gone.
