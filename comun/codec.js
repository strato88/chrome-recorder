// Elección del tipo MIME de grabación. Módulo puro: la detección real se inyecta (esSoportado).

const PERFILES_H264 = ['avc1.640034', 'avc1.4D0034', 'avc1.42E034', 'avc1'];

const mime = (video, audio) => `video/mp4;codecs="${audio ? `${video},${audio}` : video}"`;

function candidatas(conAudio, permitirOpus) {
  if (!conAudio) return PERFILES_H264.map((v) => mime(v));
  const lista = PERFILES_H264.map((v) => mime(v, 'mp4a.40.2'));
  if (permitirOpus) lista.push(...PERFILES_H264.map((v) => mime(v, 'opus')));
  return lista;
}

// plataforma: chrome.runtime.getPlatformInfo().os; esSoportado: (mime) => boolean
export function elegirCodec({ conAudio, esSoportado, plataforma, permitirOpus = false }) {
  if (plataforma === 'linux' && !permitirOpus) return { error: 'linux' };
  const elegido = candidatas(conAudio, permitirOpus).find((m) => esSoportado(m));
  return elegido ? { mime: elegido } : { error: 'sin_mp4' };
}
