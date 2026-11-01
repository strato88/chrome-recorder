const { chromium } = require('playwright');
(async () => {
  const ext = process.argv[2];
  const ctx = await chromium.launchPersistentContext('', {headless: false, viewport: null, args: [
    `--disable-extensions-except=${ext}`, `--load-extension=${ext}`, '--auto-select-desktop-capture-source=Entire screen', '--force-device-scale-factor=2']});
  let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const eid = sw.url().split('/')[2];
  const pe = await ctx.newPage(); await pe.goto(`chrome-extension://${eid}/off.html`);
  const r = await pe.evaluate(() => new Promise(res => chrome.desktopCapture.chooseDesktopMedia(['screen'], async sid => {
    try {
      const st = await navigator.mediaDevices.getUserMedia({video: {mandatory: {chromeMediaSource: 'desktop', chromeMediaSourceId: sid}}});
      const s = st.getVideoTracks()[0].getSettings(); st.getTracks().forEach(t => t.stop());
      res({misma_pagina: 'OK', w: s.width, h: s.height, fps: s.frameRate, surf: s.displaySurface});
    } catch (e) { res({misma_pagina: e.name + ': ' + e.message}); }
  })));
  console.log(JSON.stringify(r));
  const r2 = await pe.evaluate(async () => { try { const st = await navigator.mediaDevices.getDisplayMedia({video: true}); const s = st.getVideoTracks()[0].getSettings(); st.getTracks().forEach(t => t.stop()); return {gdm: 'OK', w: s.width, h: s.height}; } catch (e) { return {gdm: e.name + ': ' + e.message}; } });
  console.log(JSON.stringify(r2));
  await ctx.close();
})().catch(e => { console.error('FALLO', e.message); process.exit(1); });
