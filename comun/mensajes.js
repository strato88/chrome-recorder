// Nombres de los mensajes entre piezas y envío con chrome.runtime.sendMessage.

// Al service worker (sin `destino`).
export const AL_ORQUESTADOR = Object.freeze({
  iniciar: 'iniciar', // {config, tituloPestana, pestanaId}
  pausar: 'pausar',
  reanudar: 'reanudar',
  detener: 'detener',
  cancelar: 'cancelar',
  revisar: 'revisar', // de una página: «mira si la grabación se ha quedado colgada»
  pendientes: 'pendientes', // del popup: ids de las grabaciones sin guardar ni vista abierta
  abrir_pendientes: 'abrir_pendientes', // del popup: abre sus vistas previas
  captura_lista: 'captura_lista', // {sesionId, ancho, alto, original, conAudio, superficie, mime}
  progreso: 'progreso', // {sesionId, ms, bytes}
  terminado: 'terminado', // {sesionId, hayVideo}
  error: 'error', // {sesionId, codigo, detalle}
  aviso: 'aviso', // {sesionId, codigo, ancho?, alto?, minutos?}
});

// Al documento offscreen: todos llevan `destino: 'offscreen'` y `sesionId`.
export const OFFSCREEN = 'offscreen';
export const A_GRABADORA = Object.freeze({
  abrir: 'abrir', // {config, permitirOpus, modoPrueba, limites: {avisoMs, maxMs, libreBytes?}, plataforma, tituloPestana}
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

export const ERRORES = Object.freeze([
  'cancelado', 'permiso_sistema', 'no_empezar', 'linux', 'sin_mp4', 'sin_espacio', 'grabadora', 'resolucion', 'sin_video',
]);
export const AVISOS = Object.freeze(['sin_audio', 'reducida', 'reintento', 'poco_espacio', 'quedan_5_min']);

// Código de error de un fallo al abrir la captura (getDisplayMedia y lo que sigue
// antes de grabar). `NotAllowedError` es cancelar el selector, salvo que lo diga el
// sistema: en macOS, sin el permiso de grabar la pantalla (o sin reiniciar Chrome tras
// darlo), Chrome da «Permission denied by system».
export function codigoErrorCaptura(e) {
  if (e?.name === 'NotAllowedError') return /system/i.test(String(e?.message ?? '')) ? 'permiso_sistema' : 'cancelado';
  return 'no_empezar';
}

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
