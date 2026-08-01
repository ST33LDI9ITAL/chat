# VOIP Same-LAN Feature — End-to-End Fix Plan

> Two critical issues found in the v1.5.0 same-LAN adaptive relay (commit 9686f7a),
> verified against the current `/Users/st33l/Projects/chat/index.html`.
> Analyzed in full Aug 1, 2026. Proposed fixes below, layered by priority.
> File-transfer connections (`createFileConnection`) are unrelated and already relay-only — untouched.

---

## Issue #2 (CRITICAL, highest priority): IP-privacy gate is forgeable AND IPs leak room-wide

### End-to-end root cause

1. `broadcastPresence()` puts `publicIp`/`privateIp` into the presence payload (lines 3189–3191).
2. `encryptPayload()` (1996) encrypts presence with the **shared room key** — derived by PBKDF2 from the room password (default hardcoded `'public-chat-default-pass'`) and room slug. Every member who has the room URL/invite can derive it and decrypt **everyone's** public+private IP.
3. `isSameLanTarget()` (3840) reads `them.publicIp`/`them.privateIp` verbatim from that decrypted payload.
4. A malicious remote member can (a) read your public+private IP from your own presence, then (b) broadcast forged matching IPs. Your client then either creates the PC with `iceTransportPolicy:'all'` (3379–3382) or relaxes an existing relay-only PC (upgrade path 3863–3873, answerer path 3457–3462) — sending host + srflx candidates to a remote attacker.

**The hard constraint "remote/untrusted peers are never relaxed" is NOT upheld under an adversarial room member.** Also, presence itself already leaks IPs to every room member, so the relay-only policy is moot for privacy.

### Why the "room key is trusted" argument is wrong
The feature's premise is that room members are trusted. It is not: rooms are joined by invite/URL and the password is a fixed public constant for the default. Any member is untrusted. A paid-relay model (PLAN.md) makes this worse — the operator keys the relay, so a hijacked room membership is exactly the adversarial case we must defend.

### Proposed fix (layered)

**Fix 2a — REQUIRED: never put IPs in room-encrypted presence.**
Remove `publicIp`/`privateIp` from `broadcastPresence()` payload. This alone stops the room-wide IP leak and removes the forgery vector from the presence channel.

**Fix 2b — REQUIRED: verify same-LAN via per-peer (NIP-04) encrypted exchange, not room-key presence.**
The app already has NIP-04 ECDH (`window.NostrTools.nip04.encrypt(sk, peerPk, ...)`), used for DMs (1562). Use it for a targeted voice handshake:
- When both peers are in the same voice channel and a relay-only WebRTC connection is established, send a **kind:25000 signal with a `p` tag** to the peer whose content is NIP-04-encrypted (per-peer, only that peer can decrypt) and contains a **nonce**, ensuring freshness.
- Each peer decrypts only their own NIP-04 payload, so no other room member learns the IPs.
- `isSameLanTarget` checks the peer's private/public IP ONLY from this per-peer channel. A remote attacker cannot forge it because per-peer ECDH means only the true peer can read/produce the handshake, and no one else sees the IPs.
- **Even better — verify reachability, not assertion:** have each peer send its private IP and require a **direct reachability probe**. A same-LAN target must be reachable on a host/srflx candidate; if the "same-LAN" peer isn't actually reachable directly, ICE picks relay anyway. Because the PC is created relay-only and relaxed only after the per-peer handshake confirms both /16 matches, a forged claim yields no benefit (media still relays; the attacker gains the host IP they could already have probed — and we can additionally not relax unless the peer's candidate path is genuinely direct).

**Fix 2c — prudence: clear IPs on leave.** `leaveVoiceChannel()` should also clear `voice.publicIp`/`privateIp` (with Fix 2a these aren't broadcast anymore, but it prevents stale reuse).

### Notes
- With 2a, presence no longer carries IPs, so the earlier "presence leak" is gone regardless of 2b.
- The `detectVoiceRelay()` cosmetic label (3773) still works — it inspects local candidates of an actual connection.

---

## Issue #1 (CRITICAL, high priority): Glare deadlock on simultaneous same-LAN upgrade

### End-to-end root cause

1. Both peers, on seeing the other's matching IPs, independently run `upgradeConnectionIfSameLan()` (3858–3875).
2. Each does `setConfiguration` + `createOffer({iceRestart:true})` + sends an offer (3863–3873). There is **no glare (`_updatedForLan` is set locally only, not coordinated across peers).**
3. When a crossed upgrade offer arrives, the receiving PC is in `have-local-offer`; `setRemoteDescription(offer)` throws `InvalidStateError`. The offer handler (3436–3485) has **no rollback**, and the dispatch wrapper (`catch (err) {}`, ~2211) swallows the exception → **no answer is ever sent**.
4. The failure-recovery ICE-restart-on-`failed` handler (3398–3412) also calls `createOffer({iceRestart:true})`, which throws while `signalingState==='have-local-offer'` → caught → `_iceRestarting=false` → no retry. **Pair is stuck in `have-local-offer` until leave/reload.**
5. **This is realistic:** the subscription replays 7 days of presence (2087–2089), both sides receive each other's historical matching-IP presence in the same window, so both fire the upgrade near-simultaneously; even in steady state, 10s heartbeats can coincide.

### Proposed fix — orderly glare resolution + rollback

**Fix 1a — REQUIRED: implement RFC-3264-style glare resolution on the upgrade.**
Add a per-pair connection epoch/counter:
- When either side wants to upgrade (or ICE-restart), it sends an offer carrying a `epoch` field (payload `{type:'offer', sdp, epoch}`).
- On receiving an offer while in `have-local-offer` (glare), compare epochs:
  - The side that is the **deterministic initiator per the existing rule** (lower pubkey wins) proceeds; the other side **rolls back** and waits, then answers.
- This uses the same `this.user.pk < ev.pubkey` initiator rule already used for initial connection (3229), keeping it consistent.

**Fix 1b — REQUIRED: add a proper offer handler that can roll back.**
In `onIncomingWebRTCSignal`'s offer branch:
- Guard `pc.signalingState`:
  - `have-local-offer`/`stable` with a pending glare → if this peer is not the initiator, `await pc.setLocalDescription({type:'rollback'})` then apply the incoming offer; if this peer IS the initiator, ignore the crossed offer (the other side will roll back and answer ours).
  - `have-remote-offer` → normal answer path (existing behavior).
- Never silently swallow: at minimum log; ideally don't swallow the glare case (only genuine corruption is ignorable).

**Fix 1c — RECOMMENDED: make the ICE-restart-on-failed handler glare-aware.**
Before calling `createOffer({iceRestart:true})` in the `failed` handler (3398), ensure `signalingState === 'stable'` (or `have-remote-offer` where rollback applies). If already `have-local-offer`, do not schedule a new ICE restart — the in-flight offer will resolve the glare.

**Fix 1d — RECOMMENDED: avoid unnecessary ICE restarts (set `_updatedForLan` eagerly).**
`createPeerConnection` sets policy `'all'` for a same-LAN PC but never sets `pc._updatedForLan` (3377), so the first subsequent presence still triggers `upgradeConnectionIfSameLan` → needless `setConfiguration`+ICE restart on an already-direct connection. Set `pc._updatedForLan = sameLan` at PC creation.

---

## Secondary (lower priority, from review)

- **/16 check doesn't truly block CGNAT:** two households behind the same carrier CGNAT with default 192.168.x LANs pass both checks. With 2b (per-peer handshake + reachability) the practical impact is low (media still relays if host paths are unroutable), but the "CGNAT users never relaxed" claim should not be overstated. Optional: verify actual direct reachability before relaxing (Fix 2b reachability probe covers this).
- **`discoverLocalIps` sticky failure:** on timeout/failure it caches `'unknown'` and early-returns forever (3808), and depends solely on one Google STUN (3811). Recommended: allow one retry; add a fallback STUN. Conservative (no privacy impact) but the feature silently stays off.
- **IPv4-only + mDNS/IPv6:** `isSameLanTarget` requires dotted-quad IPv4 (3849). mDNS (`.local`) or IPv6 host candidates silently disable same-LAN detection. Chrome exempts mDNS after `getUserMedia` permission (granted here), but must be verified per-browser; consider handling non-IPv4 host candidates explicitly (treat as unknown → relay, safe default).

---

## Recommended implementation order

1. **2a + 2b** (IP privacy) — non-negotiable to restore the hard constraint.
2. **1a + 1b + 1c** (glare/rollback) — prevents stuck calls.
3. **1d + cleanup + secondary hardening** as applicable.

All fixes stay "half-inch-by-half-inch": touch the presence payload, add a per-peer NIP-04 voice handshake, add epoch+rollback to the offer path, and eagerly set `_updatedForLan`. File transfer untouched.
