chrome.runtime.onMessage.addListener((m, s, resp) => {
  if (m.tipo !== 'grabar') return;
  (async () => {
    try {
      const v = {mandatory: {chromeMediaSource: 'desktop', chromeMediaSourceId: m.sid, maxWidth: 8192, maxHeight: 8192, maxFrameRate: 30}};
      const st = await navigator.mediaDevices.getUserMedia({video: v, audio: m.audio ? {mandatory: {chromeMediaSource: 'desktop', chromeMediaSourceId: m.sid}} : false});
      const set = st.getVideoTracks()[0].getSettings();
      const tipos = ['video/mp4;codecs="avc1.640034,mp4a.40.2"', 'video/mp4;codecs="avc1.640034,opus"', 'video/mp4;codecs=avc1'];
      const mime = tipos.find(t => MediaRecorder.isTypeSupported(t));
      const rec = new MediaRecorder(st, {mimeType: mime});
      const trozos = []; rec.ondataavailable = e => trozos.push(e.data.size);
      rec.start(1000); await new Promise(r => setTimeout(r, 3000));
      await new Promise(r => { rec.onstop = r; rec.stop(); });
      st.getTracks().forEach(t => t.stop());
      const est = await navigator.storage.estimate();
      resp({ok: true, settings: set, mime: rec.mimeType, trozos, pistas: st.getTracks().map(t => t.kind), cuota: est.quota, sfp: typeof self.showSaveFilePicker});
    } catch (e) { resp({ok: false, err: e.name + ': ' + e.message}); }
  })();
  return true;
});
chrome.runtime.onMessage.addListener((m, s, resp) => {
  if (m.tipo !== 'gdm') return;
  navigator.mediaDevices.getDisplayMedia({video: true, audio: true, systemAudio: 'include'}).then(st => {
    const s = st.getVideoTracks()[0].getSettings(); const k = st.getTracks().map(t => t.kind); st.getTracks().forEach(t => t.stop());
    resp({ok: true, w: s.width, h: s.height, surf: s.displaySurface, pistas: k});
  }).catch(e => resp({ok: false, err: e.name + ': ' + e.message}));
  return true;
});
