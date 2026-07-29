# 💬 Chat: Single-File Serverless Encrypted P2P Voice, Video & File Sharing

A fully self-contained, serverless single-page web application (`index.html`) for zero-trust encrypted communication. Features text chat, voice/video calls, file transfers, polls, GIF search, and more — all P2P with no backend.

Deployable directly to **GitHub Pages** with zero backend infrastructure.

---

## ✨ Features

### 🔐 Security
- **Zero-Trust Client-Side Encryption**: All messages encrypted with **256-bit AES-GCM** using **100,000 PBKDF2 iterations of SHA-256** with room-specific salt.
- **Ephemeral Identities**: Auto-generated `secp256k1` keypairs per session, stored only in `sessionStorage`.
- **Nostr Event Signature Verification**: All incoming events verified via Schnorr signatures — forged events rejected.
- **TURN-Forced WebRTC**: All voice, video, and file transfer traffic goes through TURN relays — IPs hidden from other peers.

### 📡 Messaging
- **Text Chat**: Room-based channels with per-channel topics and pinned messages (MOTD).
- **Direct Messages**: NIP-04 ECDH-encrypted private conversations.
- **Rich Media Embeds**: Automatic inline rendering for YouTube, images, GIFs, MP4/WebM videos.
- **GIF Picker**: Search and insert GIFs via Gifbox API.
- **Image Paste/Drag**: Paste images from clipboard or drag-and-drop files directly into chat.
- **Reactions**: Emoji reactions with toggle on/off (one vote per emoji per user).
- **File Transfers**: P2P file sharing over WebRTC data channels (TURN-anonymized) with progress bars. Video files play inline after transfer.
- **Polls**: Create multiple-choice polls via `/poll "Q?" "A" "B"` with live vote syncing.

### 👑 Room Management
- **Room Ownership**: First joiner becomes owner. Owner can rename room, set password, manage channels.
- **Moderators**: Owner can delegate moderation via `/mod <pubkey>`.
- **Channel CRUD**: Owners can add/remove text and voice channels.
- **Unique Room IDs**: 32-character random IDs — unguessable.
- **Recent Rooms**: Sidebar shows recently joined rooms with quick-switch.

### 🎤 Voice & Video
- **WebRTC Voice Channels**: Join voice channels with P2P audio.
- **Per-Peer Volume**: Individual volume sliders (0-200%) for each speaker.
- **Mute/Deafen**: Global mic mute and audio deafen controls.
- **Speaking Detection**: Real-time audio frequency analysis with visual glow rings.
- **TURN-Forced**: All media relayed through TURN for IP anonymity.

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
- **TURN Relays**: ExpressTURN (primary, 1TB/mo free tier), Metered.ca (public fallback)
- **File Transfer**: P2P WebRTC data channels over TURN
- **GIF Search**: [Gifbox](https://gifbox.me) free API (no key required)
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
- **Ephemeral Messages**: Page reload clears room messages (re-fetched from relays). DM conversations persist in sessionStorage. Room config persists in localStorage.
- **TURN Bandwidth**: The free ExpressTURN tier (1TB/month) is sufficient for text + voice. Heavy file transfers may consume it faster.
- **File Transfer**: Requires both peers to be online simultaneously. Files are transferred P2P over WebRTC data channels and are not stored on any server.
- **Hardcoded Relays**: Six default Nostr relays are hardcoded. No UI to add/remove relays yet.
- **Relay Dependency**: App relies on Nostr relays for message delivery. If all relays are unreachable, messaging is unavailable.

---

## 🌐 GitHub Pages Deployment

Since the entire application is contained inside `index.html`, deploying to GitHub Pages requires no build step:

1. Push your repository to GitHub.
2. Go to **Settings > Pages** in your GitHub repository.
3. Select **Source: Deploy from a branch**.
4. Choose **Branch: main** and **Folder: / (root)**, then click **Save**.
5. Your app will be live at `https://st33ldi9ital.github.io/chat/`!

---

## ☁️ GitHub Secrets (for CI/CD TURN Credentials)

The GitHub Actions workflow (`deploy.yml`) injects ExpressTURN credentials at deploy time.
Set the following secrets in your GitHub repository at **Settings > Secrets and variables > Actions**:

| Secret | Description |
|--------|-------------|
| `EXPRESS_TURN_URL` | ExpressTURN relay URL (e.g. `turn:your-relay.example.com:3478`) |
| `EXPRESS_TURN_USER` | ExpressTURN username |
| `EXPRESS_TURN_PASS` | ExpressTURN credential / password |

If these secrets are not set, the app falls back to public ExpressTURN demo credentials
(no guarantee of availability) and Metered.ca open TURN relays.

## 📄 License

MIT License. Free for open-source use and customization.
