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
- [ ] ⛔ **Blocking:** resolve stable room ownership vs. ephemeral identity **before** any per-room TURN (see Section 5). TURN key custody/billing cannot ride on a transient claim-based identity.

---

## 3. Non-Goals (out of scope for now)

- Self-hosted coturn (avoid — we explicitly want Cloudflare-only).
- Global/centralized TURN pool paid by the platform.
- Server-side SFU / Discord-style hub for this app (may be relevant for the MMO separately).
- Hard, un-bypassable bandwidth enforcement at the relay layer (requires coturn-style per-user quotas, which conflicts with Cloudflare-only). We settle for client-side soft enforcement.

---

## 4. Architecture

### 4.1 Owner-scoped TURN (NOT per-room)

**Decision: TURN is tied to the owner, not the room** (July 31, 2026). An owner may run **multiple rooms** (personal + several community rooms); a separate TURN key + Worker per room would be wasteful and confusing. One owner → one Cloudflare TURN Key + one credential-minting Worker, which serves **all of their rooms**.

- Each owner provides their own **Cloudflare TURN Key** (their billing), once.
- All of that owner's room clients mint **short-lived** TURN credentials from that single key.
- Long-lived credentials live only on the **owner's server-side credential-minting endpoint** (their Cloudflare Worker).
- TURN service is global (Cloudflare), so no per-region infra management.

### 4.2 Credential minting (decision: per-owner Worker only)
- **Per-owner Cloudflare Worker** (chosen): one tiny Worker the owner deploys **themselves**, holding their Cloudflare TURN `Key ID` + `API token` as Worker secrets and exposing an endpoint returning short-lived `iceServers`. All of the owner's rooms point at **this same Worker**. Owner-controlled billing + credential custody, once.
- The owner↔room binding is: every room owned by that owner references the **same** Worker endpoint. The app resolves a room's TURN source by looking up the room's owner, then using the owner's registered Worker.
- ~~Per-room Worker~~ — **not chosen**: duplicates setup (key + Worker) for an owner running many rooms.
- ~~Central Worker managing many owners' keys~~ — **rejected**: would make the platform (or a single operator) custodian of every owner's long-lived Cloudflare API token, incurring security/liability and defeating cost isolation. Never hold another user's long-lived Cloudflare credentials.

### 4.3 Client wiring
- Room settings reference the **owner's** TURN Worker endpoint (not a per-room one). Since rooms are already key-derived (slug bound to the owner pubkey), the app resolves a room's TURN source via its owner -> owner's registered Worker.
- When joining any of the owner's room voice channels, the client requests short-lived `iceServers` from the owner's minting Worker (or uses a refresh loop if creds expire mid-session).
- Per-pair `iceTransportPolicy`: relay-only for remote/untrusted peers; same-LAN detection already implemented and preserved.

---

## 5. ⛔ BLOCKING CONSTRAINT: Stable Room Ownership vs. Ephemeral Identity

> This is the **highest-priority blocker** for bring-your-own-TURN. Discussed July 31, 2026. Do not implement per-room TURN until this is resolved.

### The problem

The BYO-TURN model hands a room's paid relay (and the Cloudflare TURN Key + API token behind it) to the **room owner**. But the app's identity + ownership model is fundamentally **transient**:

- **Identity is ephemeral (`sessionStorage`):** every client generates a new secp256k1 keypair on first load in a tab and stores it in `sessionStorage`. Closing the tab / opening a new one → **brand-new pubkey each time.**
- **Ownership is a timestamped claim:** room ownership is a signed kind:1 event with an encrypted `type:'ownership'` payload on the Nostr relay (legacy header comment says kind:30000, but the code publishes kind:1). Resolved by **earliest claim timestamp wins; tie → lowest pubkey wins.** Also cached locally in `chat_room_owners` (localStorage).
- **Takeover on absence:** if an owner's claim is stale/absent and another client is present when no better claim exists, a newcomer **self-claims** after the ~6s grace period (`_resolveOwnership`) and **becomes owner**.

### Why this breaks BYO-TURN (unsafe)

TURN key ownership is 100% about **billing + custody**: who funds the relay, who holds the long-lived Cloudflare token, who can edit the room's TURN config. With ephemeral identity:

- Room owner closes tab (as they often will) → they lose their pubkey.
- When they return, they're a **different pubkey** → not recognized as owner → **cannot re-own their own room**.
- A present stranger can **self-claim and effectively take over** the room **and its paid TURN relay** → billing + credential-custody risk to the prior owner.
- Orphaned-owner rooms are ambiguous (owner vanished, no valid claim).

### Root cause

The default privacy stance (ephemeral identity) **conflicts directly** with the need for **stable, permanent, unforgeable room ownership** that a paid-relay model depends on. Client-only + no-server gives no trusted anchor for "who is the rightful permanent owner of this room."

### Key insight (July 31, 2026 discussion)

Rooms are **already effectively key-derived**: the app uses the user pubkey hash to build the personal room slug, and room display names are cosmetic. So making a room inherently owner-bound is *not* a new cost — it's close to the current model. And because **TURN is owner-scoped (see 4.1)**, the thing that must be anchored is the **owner's TURN config**, not per-room ownership state.

A hardware-derived persistent owner key helps confirm identity, but does **not** by itself make a room durable in a no-server app: ownership still lives as signed events on Nostr relays (which can be pruned/filtered), with no ordering authority. So the achievable, safe target for BYO-TURN is: **the owner's TURN config is key-locked and fail-closed** — even if claim-based room ownership is ambiguous for a spell, no one can hijack or re-point the owner's paid relay.

### Options (discussion)

**A. Stable per-user identity (opt-in) for owners.**
Persist a key for rooms a user "owns" (export a seed, or a "save my identity" flow). Owner uses a persistent key → only they can set the room's TURN. Rooms without a stable owner **cannot** have a BYO-TURN relay (fall back to platform/default relay-only).
— Most aligned with a real product; adds an identity opt-in layer the app currently lacks.

**B. Owner capability token surviving tab close.**
Issue/derive a stable ownership token stored separately (e.g., localStorage) that re-authenticates the same human as owner regardless of ephemeral pubkey. Softer than full stable identity; still needs a trust anchor.

**C. Ownerless-room fail-safe for TURN.**
By default a vanished owner's room drops to default (non-paid) relay behavior; do **not** let a random newcomer inherit control of a paid custom TURN. Prevents billing/custody hijack without solving identity. **Minimum required regardless of other choices.**

**D. TURN config strictly owner-mutated + fail-closed.**
Tie TURN config editing to the resolved owner's authenticated identity; refuse all custom-TURN config without a confirmed stable owner. Complements C.

**Recommended minimum:** C + D (make claim-based takeover never inherit a paid TURN relay). Because TURN is **owner-scoped**, this effectively means: the owner's TURN config is a signed, owner-locked record on the relay; a claim-based newcomer to a room inherits only a **default/non-paid** relay until the true owner (holding the anchoring key) re-asserts. **Full fix:** A (stable owner identity) on top — mostly to let the true owner conveniently re-lock their rooms, not strictly required for relay safety.

### Open questions for discussion

- Do we introduce stable/permanent identity for room owners, or keep everything ephemeral for privacy?
- How to reconcile "privacy by default" with "ownership must survive the owner closing the tab"?
- Should ownership ever transfer, and if so under what explicit control (not automatic claim takeover)?
- How do we prevent a hijacker from at minimum inheriting/manipulating a room's **paid TURN config** even if we keep claims ephemeral?

---

## 6. Per-User Bandwidth Monitoring, Alerts & Restrictions (recurring theme)

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

## 7. Onboarding for Room Operators

Goal: reduce "create Cloudflare TURN key + deploy Worker" to the lowest possible friction.

**Decision (July 31, 2026): do NOT run a shared Worker for all rooms.**
Hosting room owners' Cloudflare API tokens means taking on their billing custody and a security/liability burden that's not worth it. Each room owner should deploy their **own** Worker so their TURN key/API token stays in **their** Worker's secrets. This preserves full cost isolation and credential custody. The general principle: the app can never be the custodian of another user's long-lived Cloudflare credentials.

### Recommended onboarding: Wrangler + official Cloudflare TURN template
- Cloudflare publishes an **official TURN-credentials Worker example** (`cloudflare/speedtest` → `example/turn-worker/`). It reads a TURN key ID + API token from Worker env secrets, restrict caller by Referer origin, and returns short-lived `iceServers`. Use this as the template.
- **Wrangler CLI** (`npm create cloudflare@latest` + `npx wrangler deploy`) can scaffold and deploy a Worker from a template with minimal commands. The room owner authenticates with **their own** Cloudflare account (there is no way — and no reason — to avoid the owner authenticating to Cloudflare).
- Provide a **packaged onboarding script** (`setup-turn.sh` or similar) that when run by the owner:
  1. Uses Wrangler to create+deploy the TURN Worker from the template
  2. Sets the Worker secrets (their TURN Key ID + API token + allowed origin) via `wrangler secret put`
  3. Prints the Worker URL + room slug to paste back into the app
  4. Optionally creates the Cloudflare TURN Key itself via the Cloudflare API/CLI (reusing a token the owner creates once)

### Friction reality
- The owner **must** authenticate to their own Cloudflare account at least once (login + one API token). There's no way around it while keeping their key in their own Worker.
- The script/template makes everything after that one-time setup near-automatic. Balance: a one-time technical setup for room owners who want voice; casual members just join and use the room's relay.
- A guided in-app walkthrough should link the script/docs for non-technical owners.

---

## 8. Open Questions / Decisions Needed

- [ ] Finalize the onboarding script (Wrangler-based) and the Worker template to vendor into this repo.
- [ ] Confirm whether to auto-create the Cloudflare TURN Key via API/CLI in the script, or require the owner create it in the dashboard once.
- [ ] How to attribute Cloudflare relay usage back to users (accept client-side attribution; or move self-hosted coturn for hard enforcement).
- [ ] Enforcement strictness: soft client caps vs. owner throttling/ban vs. hard relay quotas.
- [ ] Whether this is worth building for the sidequest now, or deferred until the concept needs real growth.

> Resolved: shared-Worker-for-all is rejected (would hold other users' Cloudflare tokens). Per-room self-deployed Worker is the chosen model.

---

## 9. Existing Implementation Notes

- Same-LAN adaptive voice relay already implemented (`iceTransportPolicy: 'all'` for trusted same-subnet peers; `'relay'` otherwise). Keep this under the per-room TURN model.
- Current app uses a global Cloudflare TURN with deploy-time short-lived credential injection. Per-room model replaces/reduces reliance on that single app-level key.
- File transfer currently always relay-only (via separate `createFileConnection`); keep relay-only, layer per-user accounting on top.

---

## 10. Related / Future (beyond this app)

- **MMO voice:** run a central TURN/SFU (Discord model) since the game server is owned/controlled anyway; central TURN + analytics-backed enforcement is the right long-term play there, not per-user-room TURN.
- **Self-hosted coturn** at scale for per-user quotas + full logs (only if Cloudflare-only constraint is relaxed).
