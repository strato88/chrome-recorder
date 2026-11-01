// Nombres de los mensajes entre piezas y envío con chrome.runtime.sendMessage.

// Al service worker (sin `destino`).
export const AL_ORQUESTADOR = Object.freeze({
  iniciar: 'iniciar', // {config, tituloPestana, pestanaId}
  pausar: 'pausar',
  reanudar: 'reanudar',
  detener: 'detener',
  cancelar: 'cancelar',
  captura_lista: 'captura_lista', // {sesionId, ancho, alto, original, conAudio, superficie, mime}
  progreso: 'progreso', // {sesionId, ms, bytes}
  terminado: 'terminado', // {sesionId, hayVideo}
  error: 'error', // {sesionId, codigo, detalle}
  aviso: 'aviso', // {sesionId, codigo}
});

// Al documento offscreen: todos llevan `destino: 'offscreen'` y `sesionId`.
export const OFFSCREEN = 'offscreen';
export const A_GRABADORA = Object.freeze({
  abrir: 'abrir', // {config, permitirOpus, modoPrueba, limites: {avisoMs, maxMs}, plataforma, tituloPestana}
  grabar: 'grabar',
  pausar: 'pausar',
  reanudar: 'reanudar',
  detener: 'detener',
  cancelar: 'cancelar',
  // Solo de prueba: la grabadora los ignora si `abrir` no trajo modoPrueba.
  probar_fin: 'probar_fin',
  probar_vigilante: 'probar_vigilante',
  probar_sin_espacio: 'probar_sin_espacio',
  probar_recorder_roto: 'probar_recorder_roto',
});

export const ERRORES = Object.freeze(['cancelado', 'linux', 'sin_mp4', 'sin_espacio', 'grabadora', 'resolucion']);
export const AVISOS = Object.freeze(['sin_audio', 'reducida', 'reintento', 'poco_espacio', 'quedan_5_min']);

// Errores de sendMessage que solo dicen «nadie ha contestado».
const SIN_RECEPTOR = /Receiving end does not exist|message port closed/i;

export async function enviar(tipo, datos = {}) {
  try {
    return await chrome.runtime.sendMessage({ ...datos, tipo });
  } catch (e) {
    if (SIN_RECEPTOR.test(String(e?.message))) return undefined;
    throw e;
  }
}
