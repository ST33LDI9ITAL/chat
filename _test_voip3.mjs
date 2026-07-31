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

  // Capture WebRTC logs
  [['A',pageA],['B',pageB]].forEach(([l,p]) => p.on('console', m => {
    const t = m.text();
    if (t.includes('WebRTC signal') || t.includes('ICE') || t.includes('iceconnection') || t.includes('disconnected')) 
      console.log(`[${l}] ${t.substring(0,180)}`);
  }));

  const ROOM = 'vo_' + Date.now().toString(36);
  await pageA.goto(BASE + '/#room=' + ROOM, { waitUntil: 'networkidle' });
  await pageA.waitForTimeout(4000);
  await pageB.goto(BASE + '/#room=' + ROOM, { waitUntil: 'networkidle' });
  await pageB.waitForTimeout(4000);

  await pageA.locator('button:has-text("General Voice")').first().click();
  await pageA.waitForTimeout(4000);
  await pageB.locator('button:has-text("General Voice")').first().click();
  await pageA.waitForTimeout(15000);

  const inspect = async (page, label) => {
    const r = await page.evaluate(() => {
      const el = document.querySelector('[x-data]');
      let d; try { d = el?.__x?.$data || window.Alpine?.$data(el); } catch(e){}
      const pcs = d?.voice?.peerConnections || {};
      return Object.entries(pcs).map(([k, pc]) => ({
        peer: k.substring(0,6),
        iceState: pc.iceConnectionState,
        gather: pc.iceGatheringState,
        localDesc: pc.localDescription?.type,
        remoteDesc: pc.remoteDescription?.type,
        candidates: pc.iceConnectionState
      }));
    });
    console.log(`[${label}]`, JSON.stringify(r));
    return r;
  };

  console.log('\n=== Connection states ===');
  await inspect(pageA, 'A');
  await inspect(pageB, 'B');
  await pageA.waitForTimeout(15000);
  console.log('\n=== After 15s more ===');
  await inspect(pageA, 'A');
  await inspect(pageB, 'B');

  await browser.close();
}
run().catch(e=>{console.error('FAIL',e.message);process.exit(1);});
