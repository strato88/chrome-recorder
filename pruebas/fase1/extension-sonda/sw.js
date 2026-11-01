self.elegir = (fuente, tabId) => new Promise(r => {
  const cb = (sid, opt) => r({sid, opt, err: chrome.runtime.lastError && chrome.runtime.lastError.message});
  try {
    if (tabId) chrome.tabs.get(tabId, t => chrome.desktopCapture.chooseDesktopMedia([fuente, 'audio'], t, cb));
    else chrome.desktopCapture.chooseDesktopMedia([fuente, 'audio'], cb);
  } catch (e) { r({exc: e.message}); }
});
self.grabar = async (id) => {
  const ex = await chrome.runtime.getContexts({contextTypes: ['OFFSCREEN_DOCUMENT']});
  if (!ex.length) await chrome.offscreen.createDocument({url: 'off.html', reasons: ['USER_MEDIA'], justification: 'grabar'});
  return chrome.runtime.sendMessage({tipo: 'grabar', sid: id.sid, audio: id.opt && id.opt.canRequestAudioTrack});
};
self.gdmOffscreen = async () => {
  const ex = await chrome.runtime.getContexts({contextTypes: ['OFFSCREEN_DOCUMENT']});
  if (ex.length) await chrome.offscreen.closeDocument();
  await chrome.offscreen.createDocument({url: 'off.html', reasons: ['DISPLAY_MEDIA'], justification: 'grabar pantalla'});
  return chrome.runtime.sendMessage({tipo: 'gdm'});
};
