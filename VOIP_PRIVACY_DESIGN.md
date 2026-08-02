# VOIP Same-LAN Privacy Fix — Design Options (for review)

> Draft for review. Status: analysis only; no code beyond the current in-progress fix is committed.
> Date: Aug 1, 2026

---

## The invariant (non-negotiable)

Remote/untrusted room members must **never** learn a user's **public IP** (the srflx/STUN-reflexive address — the internet identity). Losing this is not an option.

## Why the current in-progress fix is incomplete

What's already done & verified good:
- Presence no longer carries IPs (room-wide leak closed).
- Public IP is never explicitly placed in any payload.
- Crossed-ICE glare resolves deterministically (common case).
- Network hardening (multi-STUN, mDNS/IPv6 fail-safe, no permanent 'unknown').

The remaining hole (from review):
- Same-LAN is still decided by a **self-attested /16 string** the peer sends you. A malicious member can forge it.
- When `iceTransportPolicy` is relaxed to `'all'`, the browser gathers **srflx (public IP:port)** candidates.
- Those trickle over **kind 25000, which is room-key-encrypted** → visible to **every** room member.
- So a forged /16 → relax → your public IP leaks room-wide. Dropping the public-IP equality check (which the in-progress fix did) makes this worse than v1.5.0 for CGNAT.

**Root conflict:** a prediction-based same-LAN decision requires trusting a peer's self-report, and the relax itself emits the very data (srflx) we must keep secret.

---

## The two structural fixes that actually solve it

### Fix 1 — Per-peer encrypted voice signaling
Move peer-to-peer ICE/SDP signaling from **room-key kind 25000** to **per-peer NIP-04 kind 25500** (already routed correctly).
- Any candidate leaked during a relax (srflx/host) becomes readable by **only the intended peer**, not the room.
- This eliminates the "relax → public IP to every member" amplifier.

### Fix 2 — Reachability-based same-LAN detection (evidence, not self-report)
Replace /16 string matching with a **host-only probe**:
- Throwaway probe PC: `{ iceServers: [], iceTransportPolicy: 'all' }`.
- **Empty `iceServers` = no STUN, no TURN → only host candidates gathered, NO srflx/public IP** (srflx requires a STUN query). Privacy-safe by construction.
- Probe connection succeeds = genuine direct reachability (same LAN). Mark peer "reachable-direct."
- Probe fails = remote → **stay relay-only, always.** A remote attacker's host IPs aren't routable to you, so they can never pass the probe → never get your srflx.

### Fix 3 — Trust accelerator (optional UX)
Operator's own devices / known contacts get immediate same-LAN relaxation without waiting for the probe. Handles the common "family on one WiFi / my own multiple tabs" case instantly.

### Fix 4 — Glare correctness (from review H1)
ICE-restart-on-failed guard should require `stable` only (not `have-remote-offer`); glare-drop branch should answer the peer when our side failed.

---

## Scope options

**A. Full proper solution** = Fix 1 + Fix 2 + Fix 4 (+ optional Fix 3).
- The only design where same-LAN for arbitrary members is genuinely safe AND the public IP never reaches the room.
- Largest change: reworks voice signaling transport (not just same-LAN).

**B. Per-peer signaling only** = Fix 1 + Fix 4, keep current NIP-04 /16 handshake.
- Prevents *room-wide* srflx leak (a major win).
- Same-LAN decision still self-attested, but any leak is now peer-only, and peers must pass a handshake.
- Medium effort. Significantly better than current, simpler than A.

**C. Trust-gated only** = Fix 1 + Fix 3, no probe, no auto-detect.
- Same-LAN direct only between explicitly trusted peers; everyone else relay-only.
- Simplest & most bulletproof, but requires adding a trust/friend concept, and no automatic same-LAN for unknown same-WiFi peers.

**D. Park it** = keep current in-progress fix (presence leak fixed, glare fixed), accept residual forgeability for the sidequest, document the gap.

---

## Tradeoff summary

| | Effort | Blocks room-wide srflx leak | Blocks a remote attacker getting srflx | Auto same-LAN for unknown members |
|---|---|---|---|---|
| A (full) | High | ✅ (per-peer signaling) | ✅ (reachability probe) | ✅ (safe) |
| B (signaling only) | Med | ✅ | ⚠️ partial (peer-only, attacker must handshake) | ✅ (but forgeable to a specific peer) |
| C (trust-gated) | Med | ✅ | ✅ (only trusted peers) | ❌ (needs trust list) |
| D (park) | Low | ❌ | ❌ | ✅ (but unsafe) |

**Recommendation:** A is the "most complete and proper" per the user's stated preference. B is the pragmatic middle. C is the simplest bulletproof (at the cost of a trust feature). D is honest-deferral.

---

## Technical notes / assumptions (for review)

- **No-srflx probe assumption:** an `RTCPeerConnection` with `iceServers:[]` and policy `'all'` gathers only **host** candidates (mDNS-obfuscated on modern browsers) — no server-reflexive, because there's no STUN server. This makes the probe privacy-safe. *This is the crux and should be sanity-verified.*
- If the probe connects, host-direct media is possible WITHOUT ever relaxing the room-status; optionally use the probe/host path as the media transport with no srflx present at all.
- mDNS obfuscation: even host IPs may be `.local` names, further reducing exposure.
- Kind 25500 already routes per-peer NIP-04 before room-key (verified in the current fix).
- Moving voice ICE signaling to per-peer (Fix 1) is the single highest-leverage structural change regardless of the same-LAN mechanism chosen.

---

## DECISION (Aug 1, 2026): Solution A — Full proper fix

Chosen by the user ("do the complete and proper best total solution").

**Implementation scope:**
- **Fix 1 — Per-peer NIP-04 voice signaling (kind 25500).** Move voice offer/answer/ice signaling from room-key kind 25000 to per-peer NIP-04 kind 25500 (same channel as the LAN handshake, distinguished by payload `type`). File transfer stays on kind 25000 (relay-only, no srflx leak).
- **Fix 2 — Host-only reachability probe.** Same-LAN decided by a throwaway `RTCPeerConnection({ iceServers: [], iceTransportPolicy: 'all' })` that gathers only host candidates (no STUN → no srflx/WAN). Probe success = genuine direct reachability; failure = stay relay-only. No forgeable self-attested strings.
- **Fix 4 — Glare correctness (H1).** If we're not the initiator and our connection failed while we have a pending local offer, answer the peer's offer instead of dropping it. ICE-restart-on-failed only from `stable`.
- **Fix 3 — Trust accelerator (optional).** Same-LAN relax shortcut for explicitly trusted/own devices.

WAN IP (srflx) must never be gathered/exposed toward unverified remote peers. LAN/IPv4 private IPs are acceptable (not routable, per user "if its lan ip then it doesnt really matter").

---

## Implementation note (Aug 1, 2026, post-review fix 2)

The host-only probe's OUTBOUND ICE connectivity checks could reveal the WAN IP (a probe PC with policy 'all' would run connectivity checks to attacker-supplied remote candidates; if a "candidate" points at the attacker's public VPS, our browser sends a STUN binding to it and the VPS sees our WAN IP). FIXED by `_probeCandidateAllowed` + `_sanitizeProbeSdp`: the probe now only ever contacts RFC1918 / link-local / mDNS addresses, and any remote candidate/SDP pointing at a public endpoint is dropped. So the probe can no longer be used to exfiltrate the WAN IP.

