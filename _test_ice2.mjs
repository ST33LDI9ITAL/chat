import { chromium } from 'playwright';

const BASE = 'https://st33ldi9ital.github.io/chat';

async function run() {
  const browser = await chromium.launch({ headless: false, args: [
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    '--enforce-webrtc-ip-permission-check'
  ]});
  const ctxA = await browser.newContext({ permissions: ['microphone'] });
  const ctxB = await browser.newContext({ permissions: ['microphone'] });
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();

  // Instrument via a proxy that logs candidate gathering
  const instrument = async (page, label) => {
    await page.addInitScript((label) => {
      window.__iceLog = [];
      const origNew = window.RTCPeerConnection;
      window.RTCPeerConnection = function(cfg) {
        const pc = origNew.call(this, cfg);
        pc.addEventListener('icecandidate', (e) => {
          if (e.candidate) {
            window.__iceLog.push({
              type: e.candidate.type,
              protocol: e.candidate.protocol,
              port: e.candidate.port,
              addr: e.candidate.address,
              related: e.candidate.relatedAddress || null
            });
            console.log(`[${label} ICE] type=${e.candidate.type} proto=${e.candidate.protocol} port=${e.candidate.port}`);
          }
        });
        return pc;
      };
      Object.setPrototypeOf(window.RTCPeerConnection, origNew);
      window.RTCPeerConnection.prototype = origNew.prototype;
    }, label);
  };
  await instrument(pageA, 'A');
  await instrument(pageB, 'B');

  pageA.on('console', m => { const t=m.text(); if(t.includes('ICE')) console.log('[A]', t.substring(0,150)); });
  pageB.on('console', m => { const t=m.text(); if(t.includes('ICE')) console.log('[B]', t.substring(0,150)); });

  const ROOM = 'turn_' + Date.now().toString(36);
  await pageA.goto(BASE + '/#room=' + ROOM, { waitUntil: 'networkidle' });
  await pageA.waitForTimeout(4000);
  await pageB.goto(BASE + '/#room=' + ROOM, { waitUntil: 'networkidle' });
  await pageB.waitForTimeout(4000);
  await pageA.locator('button:has-text("General Voice")').first().click();
  await pageA.waitForTimeout(3000);
  await pageB.locator('button:has-text("General Voice")').first().click();
  await pageA.waitForTimeout(10000);

  const dump = async (page, label) => {
    const r = await page.evaluate(() => ({ ice: window.__iceLog || [], iceError: window.__iceErrors || [] }));
    console.log(`\n[${label}] ICE candidates:`);
    r.ice.forEach(c => console.log('  ', JSON.stringify(c)));
    if (!r.ice.length) console.log('   (none captured)');
  };
  await dump(pageA, 'A');
  await dump(pageB, 'B');
  await browser.close();
}
run().catch(e => { console.error('FAIL', e.message); process.exit(1); });
