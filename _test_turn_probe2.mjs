import { chromium } from 'playwright';
const BASE = 'https://st33ldi9ital.github.io/chat';
async function run() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  const iceServers = await page.evaluate(() => {
    try {
      const el = document.querySelector('[x-data]');
      const d = el?.__x?.$data || window.Alpine?.$data(el);
      return d?.iceServers || [];
    } catch(e) { return []; }
  });

  const gather = await page.evaluate((servers) => {
    return new Promise((resolve) => {
      try {
        const pc = new RTCPeerConnection({ iceServers: servers, iceTransportPolicy: 'relay' });
        const cands = [];
        // Add a data channel to force ICE gathering
        pc.createDataChannel('probe');
        pc.onicecandidate = (e) => {
          if (e.candidate) {
            cands.push({ type: e.candidate.type, protocol: e.candidate.protocol, port: e.candidate.port });
            console.log('CAND type=' + e.candidate.type + ' proto=' + e.candidate.protocol + ' port=' + e.candidate.port);
          } else {
            console.log('GATHERING COMPLETE');
            resolve({ gathering: pc.iceGatheringState, cands, err: null });
          }
        };
        pc.createOffer().then(o => pc.setLocalDescription(o)).catch(e=>{console.log('offer err '+e.message);resolve({gathering:pc.iceGatheringState,cands,err:e.message});});
        setTimeout(()=>resolve({gathering:pc.iceGatheringState,cands,err:'timeout'}), 25000);
      } catch(e) {
        resolve({ gathering:'err', cands:[], err:e.message });
      }
    });
  }, iceServers);

  console.log('\n=== RESULT ===');
  console.log('gathering:', gather.gathering, '| candidates:', gather.cands.length, '| err:', gather.err);
  gather.cands.forEach(c=>console.log('  ', JSON.stringify(c)));
  await browser.close();
}
run().catch(e=>{console.error('FAIL',e);process.exit(1);});
