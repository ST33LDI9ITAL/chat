# Plan: Bring-Your-Own-TURN Voice for a Room-Based P2P App

> Status: **Planning** (concept validated; not yet implemented)
> Scope: Sidequest community app, room-based, Cloudflare-only TURN
> Last updated: July 31, 2026

---

## 1. Overview & Motivation

A P2P, client-only voice/file app where each client relays communications through a TURN service for IP privacy and NAT traversal. The core problem: if the app itself provides/pays for one global TURN relay, the app owner pays for **all** communications across all rooms. Should the app grow, this bill is unsustainable.

**Proposed model:** each room provides its own TURN relay. The app stays free and open to all; room operators who want voice supply and fund their own relay (Cloudflare TURN). This shifts cost where it belongs (room operators), keeps the app self-hostable (the client is all users need — no server), preserves user privacy (relay-only), and is cost-isolated (a popular room pays its own bill, not the platform).

### Why this model fits
- **Room-centric comms** — no global DMs; all messages/voice are room-scoped, so "room provides relay" maps cleanly onto the architecture.
- **Affordable for small servers** — low-traffic rooms fit within Cloudflare's free tier; heavy rooms pay their own.
- **Private & secure** — relay-only hides peer IPs; TURN operators see only bytes + IPs (DTLS-SRTP keeps audio encrypted).
- **Self-hostable** — client is the whole app; no app-owned backend.

---

## 2. Goals

- [ ] App is completely free and open (client-only, no central infra).
- [ ] Voice/file relay cost is borne by each room's operator, not the platform.
- [ ] Users' IPs stay hidden from other (untrusted) peers.
- [ ] Room owners have **visibility, alarms, and restrictions** over per-user bandwidth to prevent abuse (important because TURN also carries file transfers).
- [ ] Onboarding for room operators is as close to one-step as possible (Cloudflare CLI/script, guided walkthrough, or template).

---

## 3. Non-Goals (out of scope for now)

- Self-hosted coturn (avoid — we explicitly want Cloudflare-only).
- Global/centralized TURN pool paid by the platform.
- Server-side SFU / Discord-style hub for this app (may be relevant for the MMO separately).
- Hard, un-bypassable bandwidth enforcement at the relay layer (requires coturn-style per-user quotas, which conflicts with Cloudflare-only). We settle for client-side soft enforcement.

---

## 4. Architecture

### 4.1 Per-room Cloudflare TURN
- Each room that wants voice provides its own **Cloudflare TURN Key** (owner's billing).
- The room's client mints **short-lived** TURN credentials from that key so the owner's long-lived key/API token never ships in the client.
- Long-lived credentials live only on the **owner's server-side credential-minting endpoint** (a Cloudflare Worker or similar).
- TURN service is global (Cloudflare), so no per-region infra management by owners.

### 4.2 Credential minting (two shapes, pick one)
- **Per-room Cloudflare Worker** (recommended, fully decentralized): a tiny Worker the room owner deploys (or is deployed on their behalf) that holds their Cloudflare TURN `Key ID` + `API token` as Worker secrets and exposes an endpoint returning short-lived `iceServers`. Each room points at its own Worker → owner-controlled billing.
- **Central Worker managing many room keys** (simpler, less decentralized): one Worker that mints creds for whichever room/key it's asked about. Reduces per-room deployment friction but makes the platform manager of keys (and partially re-centralizes the model).

### 4.3 Client wiring
- Room settings store the room's TURN endpoint/credential source.
- When joining a room's voice channel, the client requests short-lived `iceServers` from the room's minting endpoint (or uses a refresh loop if creds expire mid-session).
- Per-pair `iceTransportPolicy`: relay-only for remote/untrusted peers; same-LAN detection already implemented and preserved.

---

## 5. Per-User Bandwidth Monitoring, Alerts & Restrictions (recurring theme)

**Why:** TURN carries file transfers too — a malicious or careless user could burn the owner's relay bandwidth (and money) with large transfers or continuous streaming. Owners need visibility and control.

### Measurement layers
- **Client-side (achievable now, but trustless):** app controls WebRTC data channels; `RTCPeerConnection.getStats()` exposes `bytesReceived` / `bytesSent` per connection. Accumulate per-user bytes over TURN and report periodically as a signed room event (e.g., `type:'usage'`, user, bytes).
- **Relay-side (source of truth):** Cloudflare dashboard shows total relay usage per TURN key. Self-hosted coturn would give full per-user logs, but we avoid coturn. Cloudflare doesn't expose clean per-user attribution through client-facing TURN; treat owner relay total as the bill source, client reports as the attribution.
- **Hybrid reconciliation:** if client-reported per-user totals ≈ relay total, attribution is trustworthy. Divergence signals under/over-reporting.

### Features to build
- Per-user accounting (bytes in/out, session duration, file-transfer totals).
- Owner dashboard in room settings with per-user usage + trend.
- Alerts when a user crosses a daily/periodic threshold.
- Escalating restrictions:
  - Soft: per-user/day file-transfer size cap.
  - Medium: voice quality/bandwidth throttling for heavy users.
  - Hard: owner can throttle/ban a pubkey from voice/file transfer (extend existing `/mod`-style control).
  - Cooldown: reset daily/weekly budgets.

### Honest limitations
- **Client-reported is spoofable.** Good for visibility and "politeness" enforcement; a determined attacker bypasses it. Hard enforcement requires relay-layer quotas (coturn), which conflicts with Cloudflare-only.
- **File transfers are the main abuse vector** (voice ≈30 MB/hr; one big file can eat the 1TB free tier). So **file-transfer caps are the highest-value control**.
- **Privacy vs accountability:** per-user attribution by the room owner is a tradeoff. In a BYO-relay room the owner is trusted by members, so it's defensible, but document transparency.

---

## 6. Onboarding for Room Operators

Goal: reduce "create Cloudflare TURN key + deploy Worker" to the lowest possible friction.

Candidate approaches (not yet chosen):
1. **Cloudflare CLI + script** that creates the TURN Key and deploys the Worker automatically. Powerful but technical.
2. **Guided walkthrough** in the room-settings UI (step-by-step with copy-paste).
3. **One-click-ish path:** owner pastes a Cloudflare API token; we guide them through deploying a Worker template (partial automation).

Likely MVP: a **trimmed Worker template** + guided in-app walkthrough, then optionally a CLI/script for power users.

---

## 7. Open Questions / Decisions Needed

- [ ] Per-room Worker vs. central Worker managing many keys (decentralization vs. simplicity).
- [ ] Do we provide/operate a Worker template, or just docs?
- [ ] How to attribute Cloudflare relay usage back to users (accept client-side attribution; or move self-hosted coturn for hard enforcement).
- [ ] Enforcement strictness: soft client caps vs. owner throttling/ban vs. hard relay quotas.
- [ ] Onboarding UX: CLI script vs. guided walkthrough vs. template.
- [ ] Whether this is worth building for the sidequest now, or deferred until the concept needs real growth.

---

## 8. Existing Implementation Notes

- Same-LAN adaptive voice relay already implemented (`iceTransportPolicy: 'all'` for trusted same-subnet peers; `'relay'` otherwise). Keep this under the per-room TURN model.
- Current app uses a global Cloudflare TURN with deploy-time short-lived credential injection. Per-room model replaces/reduces reliance on that single app-level key.
- File transfer currently always relay-only (via separate `createFileConnection`); keep relay-only, layer per-user accounting on top.

---

## 9. Related / Future (beyond this app)

- **MMO voice:** run a central TURN/SFU (Discord model) since the game server is owned/controlled anyway; central TURN + analytics-backed enforcement is the right long-term play there, not per-user-room TURN.
- **Self-hosted coturn** at scale for per-user quotas + full logs (only if Cloudflare-only constraint is relaxed).
