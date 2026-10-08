# Pulse Notes

## Managed TURN and Connection Diagnostics

Pulse now supports managed TURN server infrastructure, strict relay-only IP
privacy, and a comprehensive real-time WebRTC diagnostics and ICE reachability
engine.

Coordination endpoints now provide an authenticated `/api/ice-servers` service
protected by anonymous session credentials, preventing unauthenticated proxy
abuse. The server resolves public STUN fallbacks (Google, Cloudflare) and
managed TURN relays via environment variables, with support for RFC 5766 Coturn
ephemeral HMAC-SHA1 time-limited credentials (`TURN_SECRET`) or static credentials
(`TURN_USERNAME`, `TURN_CREDENTIAL`).

A dedicated Connection & TURN Diagnostics suite is accessible directly from the
world map, chat workspace, and video call toolbar. It provides:

- **Live WebRTC Telemetry:** Queries `RTCPeerConnection.getStats()` every 1.5
  seconds to extract the selected candidate pair, local & remote candidate types
  (host, srflx, prflx, relay), protocol (UDP/TCP), masked IP endpoints, round-trip
  time (RTT in ms), inbound/outbound bitrates, data transferred, ICE restarts,
  and audio/video codec and resolution metrics.
- **Visual Traversal Badge:** Clear indicator displaying whether the live peer
  path is direct P2P (`Direct P2P (STUN)`) or traversing a relay (`TURN Relay`).
- **Interactive ICE Reachability Test:** Standalone on-demand probe that tests
  local network interfaces (host), STUN server reflexivity (srflx), and TURN relay
  allocation (relay) without needing a remote peer, reporting NAT diagnosis and
  discovered candidates.
- **Strict Relay IP Privacy Toggle:** Allows forcing `iceTransportPolicy: "relay"`,
  ensuring all WebRTC media and data route exclusively through TURN relays so
  neither peer learns the other's real IP address.
- **Custom TURN Override & Export:** Permits technical reviewers and developers to
  test arbitrary custom Coturn or Metered instances in-browser and copy a
  standardized diagnostic report to the clipboard.

Important trade-offs:

- Relay-only mode increases network latency and relay bandwidth costs; direct P2P
  remains the default for optimal performance while offering relay privacy as an
  explicit user choice.
- STUN discovery does not guarantee media establishment across symmetric NAT
  pairs unless TURN relays are active.
- To protect user privacy, IP addresses are strictly hidden and redacted across
  all diagnostic cards, tables, candidate logs, and exported reports. No raw or
  partial IP addresses are ever displayed or revealed in the interface.


An established peer connection now survives brief network interruptions for a
12-second grace period, kept deliberately below the anonymous presence expiry.
Pulse preserves the open conversation and call state, pauses new chat actions,
and shows a clear reconnecting status while periodically requesting an ICE
restart through the existing authenticated signaling path. Returning online
triggers an immediate retry. Successful recovery restores the active state;
only an unavailable peer or an expired grace period tears the conversation
down.

Important trade-offs:

- Recovery keeps the same `RTCPeerConnection`; it does not create durable chat
  history or restore a conversation after a page refresh or closed tab.
- STUN-only connectivity still cannot recover every restrictive network path.
  Managed TURN remains the next major reliability improvement.
- Messages and attachments are intentionally disabled during recovery rather
  than queued, preventing ambiguous duplicate delivery over a recovering data
  channel.

## Accessible calls and language matching

Each anonymous Presence now carries one allowlisted temporary conversation
language: English, Filipino, Spanish, or Japanese. The value disappears with
the session and is returned only as public peer context. Smart Match requires
both the selected intent and language, while manual map connections remain
available across languages.

The video workspace now shows a live elapsed timer, allows switching available
microphones and cameras without rebuilding the peer connection, and exposes
native browser Picture-in-Picture when supported. Captions are explicitly
opt-in, use the session language for speech recognition, and send only bounded
caption text over the existing WebRTC data channel. Pulse does not store a
caption transcript or send caption text through its API.

Important trade-offs:

- Web Speech recognition support varies by browser. Some browsers process
  speech through their own hosted service, so the call UI discloses this before
  captions are enabled; it should not be described as guaranteed on-device.
- Picture-in-Picture requires a playing remote video and browser support. The
  control stays disabled when either requirement is missing.
- Device labels become available only after media permission. Switching a
  camera while screen sharing is disabled to avoid replacing the active shared
  screen unexpectedly.
- Language matching is an explicit preference, not translation. A future
  version could add consent-based translation with a clearly disclosed privacy
  model and locally processed captions where browser support permits it.

## Ephemeral chat context

Connected conversations now include peer-to-peer typing presence, replies, and
message reactions. Typing events are throttled and expire automatically so a
dropped stop event cannot leave the indicator stuck. Replies carry only a
bounded preview and an ephemeral UUID for the referenced message. Reactions
use a four-item allowlist and can be changed or removed by either participant.

All three features travel exclusively over the existing WebRTC data channel.
They are never uploaded to an API, stored in the database, or retained after
the anonymous connection ends. Incoming message IDs, reply previews, reaction
values, and text sizes are validated before they reach the UI.

Important trade-offs:

- Reply references and reactions exist only while both peers retain the live
  conversation in memory; there is intentionally no history synchronization.
- Typing is best-effort presence. Network delay can briefly hide it, and the
  receiver clears stale indicators after three seconds.
- Reactions are deliberately limited to four familiar choices to keep the
  anonymous chat compact and reduce ambiguous or abusive custom content.

## Safety Shield

Every connected conversation now exposes a Safety Shield with immediate leave,
block-and-leave, and report-and-block actions. Blocking is enforced on the
server in both directions: blocked sessions disappear from each other's peer
lists, queued signals between them are removed, and new signaling is rejected.
Block rows reference temporary Presence sessions and cascade away when either
session leaves or expires.

Blocked, stale, and otherwise unavailable signaling targets are normalized in
the client to the same discreet unavailable state. This preserves block privacy,
removes the peer from the local map, and avoids presenting an expected safety
outcome as an application failure.

Reports contain only the two public ephemeral session IDs, one allowlisted
reason, and timestamps. Pulse never attaches chat text, files, audio, video,
coordinates, or private session tokens. Reports expire after 30 days during
report maintenance. The incoming video prompt also includes a short consent
reminder without adding another blocking step.

Important trade-offs:

- The current server can verify both sessions are fresh but still lacks the
  deferred authoritative connected-pair state machine. A valid session could
  report another currently visible session ID without having completed a
  conversation; production moderation should account for this limitation.
- Reports are safety records, not automatic guilt or public reputation. There
  is no automated banning in this phase.
- Expired-report deletion currently runs when a new report arrives. Production
  should move retention cleanup to a scheduled job and provide an authorized
  moderator workflow.

## Pulse Thanks

After a completed anonymous conversation, either participant can share one
temporary-session appreciation signal: I felt heard, This helped, Made me
smile, or Good listener. Pulse displays the combined daily count on the map so
the community's positive activity is visible without introducing profiles,
public ratings, followers, or conversation history.

The server authenticates every contribution with the existing anonymous
session credentials and validates reactions through an explicit allowlist. A
temporary `thanksGivenAt` marker on Presence permits one contribution per
session; it disappears when that presence leaves or expires. The durable daily
row contains aggregate counters only and cannot be traced back to a session.

Trade-offs:

- One contribution per anonymous session is intentionally conservative. It
  limits casual inflation without creating durable identity or feedback logs.
- Counts use UTC calendar days so all deployments have one deterministic daily
  bucket.
- This is appreciation, not reputation. It must not be presented as a trust or
  safety score for an anonymous participant.
- Production traffic still needs the distributed rate limiting already noted
  below; the Presence claim is an integrity boundary, not a replacement for
  infrastructure-level abuse controls.

## Communication workspace

Pulse conversations now support a focused call-and-sharing workspace without
changing the anonymous session model. A video request opens a separate,
same-origin call window when the browser permits it, with an in-page fallback
when popups are blocked. During a call, either participant can mute their
microphone, turn their camera off, share their screen, or end video while the
underlying chat connection remains available.

Chat can now send ephemeral voice recordings, images, videos, and general
files. Attachments travel over the existing WebRTC data channel, are never
uploaded to an API or stored in the database, and disappear when the peer
session ends. Transfers are limited to 8 MB, split into bounded chunks, and
subject to strict metadata and concurrent-receive limits.

Purposeful Web Audio cues provide low-volume feedback for peer connection,
incoming and sent messages, ringing, call acceptance, and call end. After a
video call, both peers receive the same validated P2P duration summary in chat;
the summary remains ephemeral with the rest of the conversation.

Important trade-offs:

- Popup behavior varies by browser and mobile operating system. Pulse opens the
  call window directly from the user's click and falls back to the current tab
  if the browser blocks it.
- Peer-to-peer attachment transfer is intentionally suited to small,
  short-lived files. It has no resumable upload, transfer history, cloud
  storage, or offline delivery.
- Voice-recording formats depend on browser `MediaRecorder` support. Recordings
  stop automatically after 60 seconds and remain subject to the 8 MB limit.
- Screen sharing depends on `getDisplayMedia`, which is not available in every
  mobile browser. Canceling the browser picker leaves the existing video call
  unchanged.
- Call acceptance is independent of camera acquisition so a delayed, missing,
  or busy camera cannot leave the other participant stuck on the connecting
  screen. Pulse falls back to audio-only when the browser allows it.
- Attachment previews use local blob URLs and an explicit safe image preview
  allowlist. Other formats remain downloadable rather than rendered inline.
- Browsers may suppress sound until the visitor interacts with the page. Pulse
  primes audio on the first pointer interaction and otherwise fails silently
  rather than interrupting the connection flow.

With more time, the next improvement would be transfer progress and cancel
controls backed by an acknowledged chunk protocol, followed by cross-device
testing of camera switching and screen-share support. Larger or durable files
would require an authenticated upload service with malware scanning and
retention controls rather than expanding the peer-to-peer path.

## Phase 4: Intent + Smart Match

Pulse now asks each anonymous visitor to choose one temporary conversation
intent: Talk, Listen, Advice, or Celebrate. That intent belongs only to the
authenticated presence row, appears as lightweight map context, and disappears
with the session. Smart Match uses the existing peer snapshot to choose a
random, available person with the same intent, then sends the normal connection
request rather than creating a separate connection path.

This feature was chosen because it makes a sparse anonymous map feel more human
without adding profiles, history, or identity. It gives both people a small
amount of context before they accept a conversation, makes map markers more
meaningful, and gives visitors a low-friction way to find a relevant peer.

Important trade-offs:

- Intent is deliberately broad and immutable for the life of a session. A user
  must leave and rejoin to change it, which keeps ownership and state simple.
- Matching happens against the most recent bounded poll snapshot. A selected
  peer can become busy or leave before the request arrives; the existing signal
  flow safely declines or reports that case.
- Intent is public session metadata, like approximate coordinates and busy
  state. It is not treated as private authentication material.
- Random selection is client-side and intentionally unranked. There is no
  behavioral profiling, durable preference data, or recommendation history.

With more time, the next focused improvement would be an authenticated,
server-authorized pending/connected state machine. That would strengthen both
Smart Match and manual requests against races and unrelated control signals
without changing the anonymous product model.

## Phase 3: Security hardening

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
