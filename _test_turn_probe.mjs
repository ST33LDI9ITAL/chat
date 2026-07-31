import { chromium } from 'playwright';

// Minimal WebRTC + TURN probe: create an RTCPeerConnection, gather ICE candidates,
// and report how many relay (TURN) candidates are produced.
const BASE = 'https://st33ldi9ital.github.io/chat';

async function run() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  // Grab the ICE server config from the app (injected creds)
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  const iceServers = await page.evaluate(() => {
    try {
      const el = document.querySelector('[x-data]');
      const d = el?.__x?.$data || window.Alpine?.$data(el);
      return d?.iceServers || [];
    } catch(e) { return []; }
  });
  console.log('ICE servers:', JSON.stringify(iceServers.map(s => ({ url: s.urls, user: s.username, hasPass: !!s.credential }))));

  // Now create a bare RTCPeerConnection using the EXACT config and gather candidates
  const gather = await page.evaluate((servers) => {
    return new Promise((resolve) => {
      const pc = new RTCPeerConnection({
        iceServers: servers,
        iceTransportPolicy: 'relay'
      });
      const cands = [];
      const errs = [];
      pc.onicecandidate = (e) => {
        if (e.candidate) {
          cands.push({
            type: e.candidate.type,
            protocol: e.candidate.protocol,
            port: e.candidate.port,
            addr: e.candidate.address,
            related: e.candidate.relatedAddress || null
          });
        } else {
          // null = gathering complete
          setTimeout(() => {
            resolve({
              gatheringState: pc.iceGatheringState,
              connectionState: pc.connectionState,
              candidates: cands,
              errors: errs
            });
          }, 500);
        }
      };
      pc.ongatheringstatechange = () => {
        if (pc.iceGatheringState === 'complete') {
          setTimeout(() => {
            resolve({
              gatheringState: pc.iceGatheringState,
              connectionState: pc.connectionState,
              candidates: cands,
              errors: errs
            });
          }, 500);
        }
      };
      // Also capture errors from ICE servers
      try {
        pc.createOffer().then(o => pc.setLocalDescription(o));
      } catch(e) { errs.push(e.message); }

      // Fallback resolve after 20s
      setTimeout(() => {
        resolve({
          gatheringState: pc.iceGatheringState,
          connectionState: pc.connectionState,
          candidates: cands,
          errors: errs
        });
      }, 20000);
    });
  }, iceServers);

  console.log('\n=== TURN candidate gathering probe ===');
  console.log('Gathering state:', gather.gatheringState);
  console.log('Candidates:', gather.candidates.length);
  gather.candidates.slice(0, 20).forEach(c => console.log('  ', JSON.stringify(c)));
  console.log('Errors:', JSON.stringify(gather.errors));

  await browser.close();
}
run().catch(e => { console.error('FAIL', e); process.exit(1); });
