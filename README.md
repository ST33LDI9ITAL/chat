# 💬 Chat: Single-File Serverless Encrypted P2P Voice & Chat

A fully self-contained, serverless single-page web application (`index.html`) designed for zero-trust encrypted text chat, rich media embeds, online presence, and peer-to-peer WebRTC voice channels.

Deployable directly to **GitHub Pages** with zero backend infrastructure required.

---

## ✨ Features

- **🔐 Zero-Trust Client-Side Encryption**:
  - Encrypts all Nostr event contents (`kind: 1` chat text, `kind: 20000` presence heartbeats, and `kind: 25000` WebRTC SDP signals) using **256-bit AES-GCM**.
  - Derives keys using **100,000 PBKDF2 iterations of SHA-256** with room-specific salt.
  - Quietly discards unauthorized or improperly keyed incoming room events.

- **📡 Nostr Multi-Relay Signaling**:
  - Concurrently connects to public Nostr relays (`wss://nos.lol`, `wss://relay.damus.io`, `wss://relay.primal.net`).
  - Auto-generates ephemeral `secp256k1` keypairs per session stored in `sessionStorage`.
  - Supports custom display handles and truncated pubkey badges.

- **🔊 Anonymized P2P WebRTC Voice Channels**:
  - Relays audio streams through **ExpressTURN / Metered.ca open TURN servers** (`turn:openrelay.metered.ca:80/443`) to protect client IP anonymity.
  - Real-time Web Audio API frequency analysis powering visual glowing speaking rings around active speaker avatars.
  - Controls for global microphone mute, global deafen, noise suppression, and per-peer volume sliders (0% to 200%).

- **🎨 Modern Dark UI & Rich Media**:
  - Clean dark mode layout styled with Tailwind CSS and Lucide Icons.
  - Automatic rich media embeds: YouTube responsive videos, direct images & GIFs, and MP4/WebM video players.
  - Native DOMPurify HTML sanitization.
  - Integrated emoji picker element, reply quoting, search filter, and room invite link generator (`#room=slug&pass=secret`).

---

## 🛠️ Technical Stack

- **UI Framework & State**: [Alpine.js v3](https://alpinejs.dev/) + [Tailwind CSS](https://tailwindcss.com/)
- **Icons**: [Lucide Icons](https://lucide.dev/)
- **Sanitizer**: [DOMPurify](https://github.com/cure53/DOMPurify)
- **Signaling Protocol**: [nostr-tools v2](https://github.com/nbd-wtf/nostr-tools)
- **Emoji Picker**: [emoji-picker-element](https://github.com/nolanlawson/emoji-picker-element)
- **WebRTC Relay**: ExpressTURN / Metered.ca Open TURN Relays
- **Cryptography**: Native Web Crypto API (`window.crypto.subtle`)

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

---

## 🌐 GitHub Pages Deployment

Since the entire application is contained inside `index.html`, deploying to GitHub Pages requires no build step:

1. Push your repository to GitHub.
2. Go to **Settings > Pages** in your GitHub repository.
3. Select **Source: Deploy from a branch**.
4. Choose **Branch: main** and **Folder: / (root)**, then click **Save**.
5. Your app will be live at `https://st33ldi9ital.github.io/chat/`!

---

## 📄 License

MIT License. Free for open-source use and customization.
