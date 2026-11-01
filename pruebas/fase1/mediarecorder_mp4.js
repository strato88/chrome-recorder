const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const b = await chromium.launch({args:['--autoplay-policy=no-user-gesture-required']});
  const p = await b.newPage();
  await p.goto('about:blank');
  console.log('UA', await p.evaluate(() => navigator.userAgent));
  const tipos = ['video/mp4','video/mp4;codecs=avc1','video/mp4;codecs="avc1.42E01F,mp4a.40.2"','video/mp4;codecs="avc1.4D4028,mp4a.40.2"',
    'video/mp4;codecs="avc1.640028,mp4a.40.2"','video/mp4;codecs="avc1.640033,mp4a.40.2"','video/mp4;codecs="avc1.640034,mp4a.40.2"',
    'video/mp4;codecs="avc1.64003C,mp4a.40.2"','video/mp4;codecs="avc1.640040,mp4a.40.2"','video/mp4;codecs="avc3.640034,mp4a.40.2"',
    'video/mp4;codecs="hvc1.1.6.L153.B0,mp4a.40.2"','video/mp4;codecs="av01.0.08M.08,mp4a.40.2"','video/mp4;codecs="avc1.640034,opus"','video/webm;codecs=h264'];
  console.log(JSON.stringify(await p.evaluate(t => Object.fromEntries(t.map(x => [x, MediaRecorder.isTypeSupported(x)])), tipos), null, 1));
  for (const [w,h,codec] of [[1920,1080,"avc1.640028"],[2560,1440,"avc1.640033"],[4096,2304,"avc1.640034"],[5120,2880,"avc1.640034"],[5120,2880,"avc1.64003C"],[5120,2880,"avc1"]]) {
    const r = await p.evaluate(async ([w,h,codec]) => {
      const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
      let n = 0; const iv = setInterval(() => { g.fillStyle = `hsl(${n*7%360} 60% 50%)`; g.fillRect(0,0,w,h); g.fillStyle='#fff'; g.font='200px sans-serif'; g.fillText(String(n++), 100, 300); }, 33);
      const vs = c.captureStream(30);
      const ac = new AudioContext(); const o = ac.createOscillator(); const d = ac.createMediaStreamDestination(); o.connect(d); o.start();
      const ms = new MediaStream([...vs.getVideoTracks(), ...d.stream.getAudioTracks()]);
      const mime = `video/mp4;codecs="${codec},opus"`;
      const chunks = []; let err = null;
      let rec; try { rec = new MediaRecorder(ms, {mimeType: mime, videoBitsPerSecond: Math.round(w*h*30*0.07)}); } catch(e) { return {err: 'ctor: ' + e.message}; }
      rec.ondataavailable = e => chunks.push(e.data); rec.onerror = e => err = (e.error && e.error.message) || 'error';
      rec.start(1000);
      await new Promise(r => setTimeout(r, 4200));
      await new Promise(r => { rec.onstop = r; rec.stop(); });
      clearInterval(iv); ms.getTracks().forEach(t => t.stop()); ac.close();
      const blob = new Blob(chunks, {type: rec.mimeType});
      const sizes = chunks.map(c => c.size);
      const buf = new Uint8Array(await blob.arrayBuffer());
      let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      // sin el último trozo, para la prueba de recuperación
      const sinUlt = new Uint8Array(await new Blob(chunks.slice(0, -1)).arrayBuffer());
      let s2 = ''; for (let i = 0; i < sinUlt.length; i += 0x8000) s2 += String.fromCharCode.apply(null, sinUlt.subarray(i, i + 0x8000));
      return {mime: rec.mimeType, err, sizes, b64: btoa(s), b64b: btoa(s2)};
    }, [w,h,codec]);
    const nom = `r_${w}x${h}_${codec}`;
    if (r.b64) { fs.writeFileSync(nom + '.mp4', Buffer.from(r.b64, 'base64')); fs.writeFileSync(nom + '_cortado.mp4', Buffer.from(r.b64b, 'base64')); }
    console.log(nom, r.err || '', r.mime || '', r.sizes ? r.sizes.length + ' trozos' : '');
  }
  await b.close();
})();
