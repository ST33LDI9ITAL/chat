# Plan: Bring-Your-Own-TURN Voice for a Room-Based P2P App

> Status: **Planning** (concept validated; connectivity model decided: STUN + BYO-TURN; not yet implemented)
> Scope: Sidequest community app, room-based, Cloudflare-only TURN
> Last updated: August 1, 2026

---

## 1. Overview & Motivation

A P2P, client-only voice/file app where each client relays communications through a TURN service for IP privacy and NAT traversal. The core problem: if the app itself provides/pays for one global TURN relay, the app owner pays for **all** communications across all rooms. Should the app grow, this bill is unsustainable.

**Proposed model:** the **operator brings their own Cloudflare TURN** for their rooms. The app stays free and open to all; operators who want voice supply and fund their own relay (one Cloudflare TURN key + one Worker, owner-scoped across all their rooms). This shifts cost where it belongs (operators), keeps the app self-hostable (the client is all users need — no server), preserves user privacy (relay-only), and is cost-isolated (a popular room pays its own bill, not the platform).

### Why this model fits
- **Room-centric comms** — no global DMs; all messages/voice are room-scoped, so "operator brings relay" maps cleanly onto the architecture.
- **Client-as-server** — the room lives while people are in it and resets when empty; no durable server state to maintain (see Section 5). The client is effectively the server.
- **Affordable for small servers** — low-traffic rooms fit within Cloudflare's free tier; heavy rooms pay their own.
- **Private & secure** — relay-only hides peer IPs; TURN operators see only bytes + IPs (DTLS-SRTP keeps audio encrypted).
- **Self-hostable** — client is the whole app; no app-owned backend.

---

## 2. Goals

- [x] **Connectivity model decided: STUN-direct default + BYO-TURN for reliability/privacy.** No app-owned relay (Section 4.4).
- [ ] App is completely free and open (client-only, no central infra).
- [ ] Voice/file relay cost is borne by each room's operator, not the platform.
- [ ] Users' IPs stay hidden from other (untrusted) peers **when a relay is configured**; relay-less rooms are explicitly best-effort direct P2P (not anonymized) per Section 4.4.
- [ ] Room owners have **visibility, alarms, and restrictions** over per-user bandwidth to prevent abuse (important because TURN also carries file transfers).
- [ ] Onboarding for room operators is as close to one-step as possible (Cloudflare CLI/script, guided walkthrough, or template).
- [ ] **Intended design: client-as-server.** The room lives while people are in it; an empty room resets. No durable server state (see Section 5 for the security rails this requires).
- [ ] **Opt-in stable identity** (seed-derived, changeable) so friends can always find an operator's rooms, and owners can re-lock rooms after a reset (see Section 5).
- [ ] Layer in known tradeoff: without a relay, ~20-25% of remote connections (mobile/enterprise CGNAT) may fail — operators fix by enabling BYO-TURN.

---

## 3. Non-Goals (out of scope for now)

- **Self-hosted TURN** (coturn/eturnal/Pion/Rel/Restund/STUNner) — **deferred**, not a hard non-goal. Acknowledged as a future self-hostable FOSS path (Section 7) but NOT building it yet; onboarding not yet worked out, so Cloudflare-only for now.
- Global/centralized TURN pool paid by the platform — **never**; STUN-direct is the free default, BYO-TURN the only relay (Section 4.4).
- Optional app-owned shared relay as a connectivity bootstrap/fallback — **rejected**: free relays can't survive adoption and it re-centralizes cost; STUN + BYO-TURN covers this (Section 4.4).
- Server-side SFU / Discord-style hub for this app (may be relevant for the MMO separately).
- libp2p / DCUtR / WebTransport rewrite — **rejected** (symmetric NAT defeats it too; volunteer relays unreliable for media; Safari gap; big rewrite for no success-rate gain — Section 4.4).
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

> **Owner presence is NOT required for VOIP.** Minting is done by the owner's **always-on Cloudflare Worker**, not the owner's browser — so members' calls work whether or not the owner is signed in. The owner's API token + TURN key live in the **Worker's secrets**, not their session. The only real dependencies are (1) the owner's signed TURN-config record mapping owner -> Worker URL being retrievable (relay/localStorage), and (2) the owner keeping the Worker **deployed and billed**. If the owner stops paying/cancels the Worker, that room's voice dies — a funding issue, not a presence issue.

### 4.4 CONNECTIVITY DECISION: STUN + BYO-TURN (research-backed, Aug 2026)

**The architecture is STUN-direct as the default + operator BYO-TURN as the reliability/privacy upgrade.** No app-owned shared relay, ever. (libp2p/nodejs evaluated and rejected — see below.)

**Default — standard WebRTC/ICE with STUN** (free, unlimited):
- ICE gathers host + server-reflexive (STUN) candidates; media flows direct P2P when a path exists.
- Real-world direct (host+srflx) success is **~75-80%** (GetStream 75-80%; Kranky Geek ~80-85% direct; RTC Insights ~70% srflx; Forasoft plans 15-20% TURN).
- **~20-25% need a relay.** Failures cluster on **symmetric/CGNAT** — disproportionately **mobile cellular** and **enterprise/corporate WiFi**. STUN cannot punch symmetric NAT, period.
- No relay configured → room is **honest best-effort direct P2P (no anonymization)**: ~75-80% connect; symmetric-NAT/mobile may fail. Same-LAN direct (mDNS/host) always works.

**Upgrade — operator BYO-TURN (Cloudflare):**
- Covers the ~20-25% that need a reliable relay → ~100% remote connectivity + full anonymization for the room.
- **Cloudflare TURN free tier = 1 TB/month** — easily covers small rooms / friend groups (voice ≈ 30 MB/hr/person); typically **$0** for the dominant use case.
- Only a genuinely heavy/popular room exceeds the free tier — and then it's **the operator's bill** (cost isolation).

**Three-tier user model:**
| User | Mechanism | Direct success | Cost | Cloudflare? |
|---|---|---|---|---|
| Casual member (joins a room) | Uses that room's configured relay | — | $0 | No |
| Casual member's own no-relay room | STUN direct P2P | ~75-80% | $0 | No |
| Operator (wants reliable+private VoIP) | Set up Cloudflare TURN once | ~100% | $0 (free tier) | Yes |

**Privacy note (deliberate shift):** the current code forces `iceTransportPolicy:'relay'` for remote peers (IP-hiding non-negotiable). Under STUN+BYP, that strict relay-only policy applies **only when a relay is configured**. A relay-less room is explicitly **not anonymized** — either it connects direct (P2P, IPs visible) or fails closed. This is a scoped, labeled exception; relay-configured rooms keep strict relay-only privacy.

**Why NOT libp2p / DCUtR / WebTransport (evaluated Aug 2026):**
- libp2p/DCUtR is **NOT an alternative to STUN** — it still uses STUN/ICE for address discovery; it only decentralizes the *coordination* and swaps a dedicated TURN for **volunteer peer relays** (Circuit Relay v2).
- Its hole-punch success (~80%) matches plain STUN (~75-80%) because **symmetric NAT defeats both** — no protocol wins.
- It does NOT eliminate the relay need; it just routes the ~20% through **less reliable** volunteer relays (bad for sustained voice/file).
- Costs: major rewrite (abandon single-file WebRTC), **Safari lacks WebTransport**, still need a relay/bootstrap node, volunteer relays unreliable for media.
- Verdict: **stay on standard WebRTC/ICE + STUN-direct + BYO-TURN.** Operators get ~100% by setting up Cloudflare once; no app-owned relay; libp2p buys nothing here.

---

## 5. DESIGN: Client-as-Server — the room lives while people are in it, resets when empty

> Updated July 31, 2026. Was previously framed as a "blocker". Reframed as **intended design** (not a bug/limitation to defeat). The security rails below still apply, but the core model is embraced, not worked around.

### The model

The client **IS the server.** No durable backend exists; rooms are ephemeral, event-based constructs on Nostr relays:

- **Room lives while people are in it.** Activity keeps it present on the relay.
- **Room sleeps/resets when empty.** No idle state, no drift, no stale history — like a game lobby that only exists while players are online.
- **Owner presence is NOT required for VOIP** (see 4.3): the always-on Cloudflare Worker mints TURN creds, not the owner's browser.
- **This is the product identity:** a serverless, secure, cheap alternative to Discord — boot it, invite friends, hop on; when everyone leaves it resets. No server to run, no always-on bill (only the operator's opt-in TURN relay).

**Consequences to embrace:**
- An empty/idle room has no guarantee of surviving relay pruning. If it goes empty for days and someone rejoins, it may reset to a clean state. That's intended.
- No durable ordering/ownership authority — the present is authoritative.
- The one thing that must still be protected is the **operator's paid TURN relay** (billing + key custody). Protect that so an empty-room reset or a claim takeover never lets a stranger inherit or re-point a paid relay.

### Identity & ownership today (context)

- **Identity is ephemeral (`sessionStorage`)** by default — new secp256k1 keypair per tab; new pubkey per tab close. (Strongest privacy by default.)
- **Ownership is a timestamped claim** on the relay (signed kind:1 `type:'ownership'`), resolved by earliest timestamp, tie → lowest pubkey. Also cached in `chat_room_owners` (localStorage).
- **Takeover on absence:** if no better claim exists, a newcomer self-claims after ~6s and becomes owner. Fine for ephemeral rooms; must be fail-closed WRT paid TURN.
- Rooms are already effectively **key-derived** (personal room slug = pubkey hash; display names cosmetic).

### Security rails (keep these)

**C. Ownerless/fail-closed TURN** — an empty-or-taken-over room provides only a default (non-paid) relay until the true operator re-locks. A claim-based newcomer never inherits a **paid** relay. *Minimum required, regardless.*

**D. TURN config key-locked** — the operator's TURN config is a signed record only that operator's key can mutate. No custom TURN without a confirmed operator. Complements C.

Think: **owner-scoped TURN** (Section 4.1) is a signed, owner-locked record; a takeover of the room's *claim* inherits default relay only, until the true operator re-asserts.

### Stable identity: opt-in, seed-derived, changeable (decision)

To let friends **always find an operator's rooms** (and let an operator re-lock rooms after a reset), add an **opt-in stable identity**:

- Derive the stable ID deterministically from a **user-chosen seed hashed with unique hardware identity** (e.g., `HMAC(hardware.id, seed)`), so it's bound to the device but not guessable.
- **Users can change the seed to change their ID** — for privacy, untangling, or starting fresh — while keeping the *same* default ephemeral behavior for everyone who opts out.
- Deterministic-from-seed means the stable ID is **recoverable** (same device + same seed → same ID) without storing a private key.
- This is a **UX convenience**, not a safety requirement: it mainly lets an operator reclaim their room name/identity and register their TURN reliably across sessions.
- **Default remains ephemeral.** Opt-in only. Privacy-by-default is preserved for everyone who doesn't explicitly choose a stable ID.

### Identity change vs. TURN ownership (decision: decouple them)

**TURN ownership lives on the Cloudflare account, NOT on the chat identity.** A seed/ID change must never force touching the Worker, TURN key, or billing.

- The Worker + Cloudflare key are bound to the operator's **Cloudflare account** (human, stable, billing) — neutral and never changes.
- The chat identity only holds a **pointer** ("my rooms use this Worker URL"), not ownership-of-record.
- **On a seed/ID change:** re-link the new identity to the *same* Worker URL (one-time re-registration in settings). The Worker/TURN relay is untouched.
- Because the Worker is referrer-origin protected and controlled by the Cloudflare account, **using** the relay proves you control it — a bogus new-identity claim cannot mint working creds from a relay it doesn't control. TURN custody is anchored by Cloudflare-account access + Worker referrer protection, **not** by chat-identity continuity.

### Registration model: workerUrl + operator secret (decision)

**Store BOTH a `workerUrl` and an operator secret `key` in the operator's room settings.**

- **`workerUrl`** = public, points clients at the minting endpoint. Alone it proves nothing (any user could paste another owner's URL).
- **`key` (secret)** = the security-critical token. Set as a secret on the Worker at deploy time (alongside the TURN key ID/API token). The Worker **only mints creds when the request's secret matches** its configured value.
- Referrer-origin protection only stops *outside apps* from abusing the relay; it does **not** distinguish between users of the same app. So the per-operator secret is what actually authorizes a specific identity to use a specific Worker.
- A user who knows someone else's `workerUrl` but not their `key` is **rejected** — cannot burn that operator's relay/bill.

Settings UI would look like:
```
TURN relay setup
  Worker URL : https://yourapp-worker.<acct>.workers.dev
  Access key : ••••••••  (paste the secret configured on the Worker)
```

**(Simpler idea rejected:** deriving everything from one secret that encodes the endpoint — couples endpoint-lookup to the secret and is fragile; keep `{url, key}`.)

**User-facing simplification (decision): bundle into ONE credential to track.**
Internally we store `{url, key}`, but the onboarding **script emits a single compact code/QR** (e.g. base64 of `{workerUrl, secret}`). The operator keeps track of **one code to paste** — no need to remember the Cloudflare URL separately. On seed/identity change, the SAME code is re-linked to the new identity. (We keep `{url, secret}` internally for robustness; the one-value UX is a bundling concern, not a loss of the security model.)

### Open questions (narrowed)

- Where does the stable ID's seed live (localStorage? exported backup) and how does a user port it to a new device?
- Should a stable operator be able to explicitly **transfer** ownership (e.g., hand a room to a friend) rather than only lose/reclaim it?
- Exact fail-closed semantics: how long before an unclaimed room's paid TURN is excluded, and how does the true operator re-lock cleanly?

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

### Future: self-hosted FOSS TURN (acknowledged, NOT building yet)

The minting-Worker model is **relay-server-agnostic** — the Worker just needs to emit short-lived `iceServers`. The HMAC ephemeral-credential pattern is identical whether backed by the Cloudflare API **or** a self-hosted TURN server's `static-auth-secret`. So operators without a Cloudflare account could, in future, run their own open-source TURN on a cheap VPS.

Self-hostable, free, and open-source TURN servers (all support REST/ephemeral auth):
- **eturnal** (Erlang, MIT by ProcessOne) — cleanest, lightest, readable YAML, Docker-friendly; best drop-in.
- **coturn** (C, BSD-3) — de-facto standard (Jitsi/Nextcloud/Matrix); most mature/docs.
- **Pion TURN** (Go, MIT) — single-binary / embeddable; minimal moving parts.
- Rel (Elixir, Apache-2), Restund (Erlang, MIT), STUNner (Go/Apache-2, K8s) — other options.

**Decision: NOT building yet.** Onboarding for self-hosted relay is not yet worked out, so **stick with Cloudflare** as the sole supported path for now. Revisit self-hosted onboarding (eturnal/coturn on a VPS behind the same Worker+secret pattern) later if demand warrants.

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
