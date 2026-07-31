import { chromium } from 'playwright';
const BASE = 'https://st33ldi9ital.github.io/chat';

async function run() {
  const browser = await chromium.launch({ headless: false, args: [
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream'
  ]});
  const ctxA = await browser.newContext({ permissions: ['microphone'] });
  const ctxB = await browser.newContext({ permissions: ['microphone'] });
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();

  // Instrument both pages to log candidate types via onicecandidate patch
  const instrument = async (page, label) => {
    await page.addInitScript((label) => {
      window.__cand = [];
      const OrigPC = window.RTCPeerConnection;
      class PCPatch extends OrigPC {
        constructor(cfg) {
          super(cfg);
          const orig = this.onicecandidate;
          Object.defineProperty(this, 'onicecandidate', {
            set: (fn) => {
              this.__origOnIce = fn;
            },
            get: () => (e) => {
              if (e.candidate) window.__cand.push({ type: e.candidate.type, proto: e.candidate.protocol, port: e.candidate.port });
              if (this.__origOnIce) this.__origOnIce(e);
            }
          });
        }
      }
      window.RTCPeerConnection = PCPatch;
    }, label + '#' + Date.now());
  };
  await instrument(pageA, 'A');
  await instrument(pageB, 'B');

  const ROOM = 'vo_' + Date.now().toString(36);
  await pageA.goto(BASE + '/#room=' + ROOM, { waitUntil: 'networkidle' });
  await pageA.waitForTimeout(4000);
  await pageB.goto(BASE + '/#room=' + ROOM, { waitUntil: 'networkidle' });
  await pageB.waitForTimeout(4000);
  await pageA.locator('button:has-text("General Voice")').first().click();
  await pageA.waitForTimeout(4000);
  await pageB.locator('button:has-text("General Voice")').first().click();
  await pageA.waitForTimeout(20000);

  const dump = async (page, label) => {
    const cands = await page.evaluate(() => window.__cand || []);
    const states = await page.evaluate(() => {
      const el = document.querySelector('[x-data]');
      let d; try { d = el?.__x?.$data || window.Alpine?.$data(el); } catch(e){}
      const pcs = d?.voice?.peerConnections || {};
      return Object.entries(pcs).map(([k,pc])=>({k:k.substring(0,6),s:pc.iceConnectionState,g:pc.iceGatheringState}));
    });
    console.log(`[${label}] candidates:`, cands.length);
    cands.slice(0,15).forEach(c=>console.log('   ', JSON.stringify(c)));
    console.log(`[${label}] states:`, JSON.stringify(states));
  };
  await dump(pageA, 'A');
  await dump(pageB, 'B');
  await browser.close();
}
run().catch(e=>{console.error('FAIL',e.message);process.exit(1);});
