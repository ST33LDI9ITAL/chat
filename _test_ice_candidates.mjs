import { chromium } from 'playwright';

const BASE = 'https://st33ldi9ital.github.io/chat';

async function run() {
  const browser = await chromium.launch({ headless: false, args: [
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    '--enable-logging --v=1'
  ]});
  const ctx = await browser.newContext({ permissions: ['microphone'] });
  const page = await ctx.newPage();

  // Inject instrumentation BEFORE the app loads
  await page.addInitScript(() => {
    window.__iceCandidates = [];
    const origPC = window.RTCPeerConnection;
    window.RTCPeerConnection = class extends origPC {
      constructor(cfg) {
        super(cfg);
        const origOnIce = this.onicecandidate;
        this.onicecandidate = (e) => {
          if (e.candidate) {
            window.__iceCandidates.push({
              type: e.candidate.type,
              protocol: e.candidate.protocol,
              address: e.candidate.address,
              port: e.candidate.port,
              relay: e.candidate.relatedAddress ? 'relayed' : 'direct'
            });
          }
          if (origOnIce) origOnIce.call(this, e);
        };
        this.addEventListener('icecandidate', (e) => {
          if (e.candidate) {
            window.__iceCandidates.push({ evt: 'relay', type: e.candidate.type });
          }
        });
      }
    };
  });

  const ROOM = 'turn_' + Date.now().toString(36);
  await page.goto(BASE + '/#room=' + ROOM, { waitUntil: 'networkidle' });
  await page.waitForTimeout(4000);
  await page.locator('button:has-text("General Voice")').first().click();
  await page.waitForTimeout(8000);

  const result = await page.evaluate(() => {
    const data = document.querySelector('[x-data]');
    let d;
    try { d = data?.__x?.$data || window.Alpine?.$data(data); } catch(e){}
    const pcs = d?.voice?.peerConnections || {};
    const pcInfo = Object.entries(pcs).map(([k, pc]) => ({
      peer: k.substring(0,6),
      iceState: pc.iceConnectionState,
      gatheringState: pc.iceGatheringState,
      // Force gathering to complete check
    }));
    return {
      candidates: window.__iceCandidates || [],
      pcs: pcInfo,
      iceServers: d?.iceServers || []
    };
  });

  console.log('=== ICE candidates gathered ===');
  result.candidates.forEach(c => console.log(JSON.stringify(c)));
  console.log('Total candidates:', result.candidates.length);
  console.log('ICE states:', JSON.stringify(result.pcs));
  console.log('ICE servers configured:', JSON.stringify(result.iceServers.map(s => s.urls || s.url)));

  await browser.close();
}
run().catch(e => { console.error('FAIL', e); process.exit(1); });
