# 💬 Chat: Single-File Serverless Encrypted P2P Voice, Video & File Sharing

A fully self-contained, serverless single-page web application (`index.html`) for zero-trust encrypted communication. Features text chat, voice/video calls, file transfers, polls, GIF search, and more — all P2P with no backend.

Deployable directly to **GitHub Pages** with zero backend infrastructure.

---

## ✨ Features

### 🔐 Security
- **Zero-Trust Client-Side Encryption**: All messages encrypted with **256-bit AES-GCM** using **100,000 PBKDF2 iterations of SHA-256** with room-specific salt.
- **Ephemeral Identities**: Auto-generated `secp256k1` keypairs per session, stored only in `sessionStorage`.
- **Nostr Event Signature Verification**: All incoming events verified via Schnorr signatures — forged events rejected.
- **Adaptive IP Privacy**: Voice/video/file traffic is relayed through Cloudflare TURN — IPs hidden from remote peers. Same-LAN trusted peers (same public IP + same private subnet) connect directly for lower latency, while remote and untrusted peers are always relay-only (never relaxed), so IP-anonymity from outsiders is preserved.

### 📡 Messaging
- **Text Chat**: Room-based channels with per-channel topics and pinned messages (MOTD).
- **Direct Messages**: NIP-04 ECDH-encrypted private conversations.
- **Rich Media Embeds**: Automatic inline rendering for YouTube, images, GIFs, MP4/WebM videos.
- **GIF Picker**: Search and insert GIFs via GIPHY API (Powered by GIPHY) with featured + preview-on-hover.
- **Image Paste/Drag**: Paste images from clipboard or drag-and-drop files directly into chat.
- **Reactions**: Emoji reactions with toggle on/off (one vote per emoji per user), synced across all users via Nostr events.
- **File Transfers**: P2P file sharing over WebRTC data channels (TURN-anonymized) with progress bars. Video files play inline after transfer.
- **Polls**: Create multiple-choice polls via `/poll "Q?" "A" "B"` with live vote syncing.

### 👑 Room Management
- **Room Ownership**: First joiner becomes owner. Owner can rename room, set password, manage channels.
- **Moderators**: Owner can delegate moderation via `/mod <pubkey>`.
- **Channel CRUD**: Owners can add/remove text and voice channels.
- **Unique Room IDs**: 32-character random IDs — unguessable.
- **Subscribed Rooms**: Sidebar shows rooms you explicitly joined (no auto-add) with custom room icons.

### 🎤 Voice & Video
- **WebRTC Voice Channels**: Join voice channels with P2P audio.
- **Per-Peer Volume**: Individual volume sliders (0-200%) for each speaker.
- **Mute/Deafen**: Global mic mute and audio deafen controls.
- **Speaking Detection**: Real-time audio frequency analysis with visual glow rings on avatars in voice channels and membership list.
- **Adaptive Relay**: Same-LAN users connect directly (low latency, works on a home network); remote/untrusted peers are always relay-only via Cloudflare TURN, preserving IP anonymity.
- **Same-LAN Detection**: Public + private IPs are exchanged via presence; only same-public-IP peers sharing a private subnet are treated as trusted local peers.
- **Channel Icon Picker**: Custom emoji/icon per channel.
- **Command Autocomplete**: Type `/` to see all commands with descriptions.

### ⌨️ Commands
- `/me <action>` — italic action messages
- `/w <user> <msg>` — whisper/DM
- `/nick <name>` — change display name
- `/clear` — clear message history
- `/join <slug> [pass]` — switch rooms
- `/topic <text>` — set channel topic
- `/room <name>` — rename room (owner only)
- `/motd <text>` — set pinned message
- `/clearmotd` — remove pinned message
- `/poll "Q?" "A" "B"` — create poll
- `/mod <pubkey> [remove|list]` — manage moderators (owner only)
- `/dm <user>` — open DM
- `/relay` — show relay status
- Fuzzy matching: mistyped commands auto-correct.

### 👥 Member Management
- **Role Badges**: 👑 crown for owner, 🛡 shield for moderators in member list.
- **Sorted List**: Owner first, then moderators, then users.
- **@mentions**: Fuzzy-matched autocomplete dropdown. Click mentions to open DM.

### 🎨 UI
- Dark theme with Tailwind CSS and Lucide Icons.
- Emoji picker with reaction support.
- Smart scroll (auto-scroll only when near bottom).
- Toast notifications.
- Customizable avatars (DiceBear, initials, identicon, or custom URL).
- Notification sound for DMs and @mentions.

---

## 🛠️ Technical Stack

- **UI Framework**: [Alpine.js v3](https://alpinejs.dev/) + [Tailwind CSS](https://tailwindcss.com/)
- **Icons**: [Lucide Icons](https://lucide.dev/)
- **Sanitizer**: [DOMPurify](https://github.com/cure53/DOMPurify)
- **Signaling**: [nostr-tools v2](https://github.com/nbd-wtf/nostr-tools) over 6 public Nostr relays
- **WebRTC**: Native browser APIs with TURN relay (`iceTransportPolicy: relay`)
- **TURN Relay**: Cloudflare TURN (primary, 1TB/mo free tier) — short-lived credentials generated at deploy time
- **File Transfer**: P2P WebRTC data channels over TURN
- **GIF Search**: [GIPHY](https://developers.giphy.com) API (Powered by GIPHY)
- **Emoji Picker**: [emoji-picker-element](https://github.com/nolanlawson/emoji-picker-element)
- **Cryptography**: Web Crypto API (`window.crypto.subtle`)

---

## 🚀 Quickstart & Local Development

1. **Clone or Download** the repository:
   ```bash
   git clone https://github.com/st33ldi9ital/chat.git
   cd chat
   ```

2. **Serve `index.html`** using any static web server:
   ```bash
   # Python 3
   python3 -m http.server 8080
   
   # Or Node npx serve
   npx serve .
   ```

3. Open `http://localhost:8080` in your browser.

> **Note**: `window.crypto.subtle` requires a secure context (HTTPS or localhost). Use the GitHub Pages URL or a local server with HTTPS.

---

## ⚠️ Known Limitations

- **No Forward Secrecy**: If a room password is compromised, all past messages (within the relay's retention window) can be decrypted.
- **Metadata Leakage**: Room slugs and event kinds are visible to Nostr relay operators. Event *content* remains encrypted.
- **Ephemeral Messages**: Page reload re-fetches room messages from relays. DM conversations persist in sessionStorage. Room config persists in localStorage.
- **TURN Credential Expiry**: Cloudflare TURN credentials have a 1-day TTL; each GitHub deploy regenerates them. Load the latest deploy within the TTL window.
- **TURN Bandwidth**: The free Cloudflare TURN tier (1TB/month) is sufficient for text + voice. Heavy file transfers may consume it faster.
- **Same-LAN Join Timing**: Because IP discovery is asynchronous, two same-LAN clients that join a voice channel at almost the same moment may experience a brief silence, then the connection upgrades to a direct path ~1–3 seconds later (once presence heartbeats confirm same-LAN). Remote peers remain relay-only.
- **File Transfer**: Requires both peers to be online simultaneously. Files are transferred P2P over WebRTC data channels and are not stored on any server.
- **Hardcoded Relays**: Six default Nostr relays are hardcoded. No UI to add/remove relays yet.
- **Relay Dependency**: App relies on Nostr relays for message delivery. If all relays are unreachable, messaging is unavailable.

---

## 🌐 GitHub Pages Deployment

Deployment is automated via a GitHub Actions workflow (`deploy.yml`) that:

1. Checks out the code.
2. Injects GIPHY + Cloudflare TURN credentials (generated fresh each deploy).
3. Commits the processed `index.html` to the `gh-pages` branch and force-pushes it.

**GitHub Pages must be configured to serve from the `gh-pages` branch** (Settings > Pages > Source > Deploy from a branch > `gh-pages` / root). Each push to `main` triggers an automatic deploy.

Your app will be live at `https://st33ldi9ital.github.io/chat/`!

---

## ☁️ GitHub Secrets (for CI/CD TURN Credentials)

The GitHub Actions workflow (`deploy.yml`) generates fresh Cloudflare TURN credentials at deploy time
and injects them into `index.html` (so TURN keys never ship in the static file).
Set the following secrets in your GitHub repository at **Settings > Secrets and variables > Actions**:

| Secret | Description |
|--------|-------------|
| `CF_TURN_ID` | Cloudflare TURN Key ID |
| `CF_TURN_TOKEN` | Cloudflare TURN API token |
| `GIPHY_API` | GIPHY API key (for the GIF picker) |

Cloudflare TURN: [create a TURN Key](https://developers.cloudflare.com/realtime/reference/turn/)
with 1TB/month free. The GIPHY key is optional — without it the picker still opens but shows a message.

## 📄 License

MIT License. Free for open-source use and customization.
