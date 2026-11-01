const { chromium } = require('playwright');
(async () => {
  const ext = process.argv[2];
  const ctx = await chromium.launchPersistentContext('', {headless: false, viewport: null, args: [
    `--disable-extensions-except=${ext}`, `--load-extension=${ext}`, '--auto-select-tab-capture-source-by-title=Example Domain', '--force-device-scale-factor=2']});
  let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const p = await ctx.newPage(); await p.setContent('<title>Example Domain</title><h1>hola</h1>');
  const t = ms => new Promise(r => setTimeout(() => r('TIMEOUT'), ms));
  console.log('pestana:', JSON.stringify(await Promise.race([sw.evaluate(() => { self.SURF = 'browser'; return self.gdmOffscreen(); }), t(20000)])));
  await ctx.close();
})().catch(e => { console.error('FALLO', e.message); process.exit(1); });
