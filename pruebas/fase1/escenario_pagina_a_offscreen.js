const { chromium } = require('playwright');
(async () => {
  const ext = process.argv[2];
  const ctx = await chromium.launchPersistentContext('', {headless: false, viewport: null, args: [
    `--disable-extensions-except=${ext}`, `--load-extension=${ext}`, '--auto-select-desktop-capture-source=' + process.argv[3], '--force-device-scale-factor=2']});
  let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const eid = sw.url().split('/')[2];
  const t = ms => new Promise(r => setTimeout(() => r('TIMEOUT'), ms));
  const pe = await ctx.newPage(); await pe.goto(`chrome-extension://${eid}/off.html`);
  const c = await Promise.race([pe.evaluate(() => new Promise(r => chrome.desktopCapture.chooseDesktopMedia(['screen','window','audio'], (sid, opt) => r({raw: sid, opt})))), t(20000)]);
  console.log('Pagina de la extension:', JSON.stringify(c && {id: c.raw ? 'SI' : c.raw, opt: c.opt}));
  if (c && c.raw) console.log('  grabado en offscreen:', JSON.stringify(await Promise.race([sw.evaluate(id => self.grabar(id), {sid: c.raw, opt: c.opt}), t(25000)])));
  await ctx.close();
})().catch(e => { console.error('FALLO', e.message); process.exit(1); });
