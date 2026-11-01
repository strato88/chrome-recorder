const { chromium } = require('playwright');
(async () => {
  const ext = process.argv[2];
  const ctx = await chromium.launchPersistentContext('', {headless: false, viewport: null, args: [
    `--disable-extensions-except=${ext}`, `--load-extension=${ext}`, '--auto-select-desktop-capture-source=' + process.argv[3], '--force-device-scale-factor=2']});
  let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const eid = sw.url().split('/')[2];
  const p = await ctx.newPage(); await p.goto('https://example.com').catch(()=>{});
  const tabId = await sw.evaluate(async () => (await chrome.tabs.query({active: true, lastFocusedWindow: true}))[0]?.id);
  const t = ms => new Promise(r => setTimeout(() => r('TIMEOUT'), ms));
  const a = await Promise.race([sw.evaluate(() => self.elegir('screen')), t(15000)]);
  console.log('SW sin pestaña:', JSON.stringify(a));
  const b = await Promise.race([sw.evaluate(id => self.elegir('screen', id), tabId), t(15000)]);
  console.log('SW con pestaña:', JSON.stringify(b && {...b, sid: b.sid ? 'SI' : b.sid}));
  if (b && b.sid) console.log('  offscreen con id de pestaña:', JSON.stringify(await Promise.race([sw.evaluate(id => self.grabar(id), b), t(20000)])));
  const pe = await ctx.newPage(); await pe.goto(`chrome-extension://${eid}/off.html`);
  const c = await Promise.race([pe.evaluate(() => new Promise(r => chrome.desktopCapture.chooseDesktopMedia(['screen','audio'], (sid, opt) => r({sid: sid ? 'SI' : sid, opt, raw: sid})))), t(15000)]);
  console.log('Pagina de la extension sin pestaña:', JSON.stringify(c && {...c, raw: undefined}));
  if (c && c.raw) console.log('  offscreen con id de pagina:', JSON.stringify(await Promise.race([sw.evaluate(id => self.grabar(id), {sid: c.raw, opt: c.opt}), t(20000)])));
  await ctx.close();
})().catch(e => { console.error('FALLO', e.message); process.exit(1); });
