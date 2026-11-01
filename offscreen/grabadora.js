// Grabadora (documento offscreen, motivo DISPLAY_MEDIA): abre el selector de
// Chrome, graba con MediaRecorder y escribe los trozos en IndexedDB.
// Solo tiene parte de chrome.runtime: el sistema y lo que necesita del almacenamiento
// le llegan en `abrir`.
import { TIMESLICE_MS, VIGILANTE_MS } from '../comun/config.js';
import { AUDIO_BPS, bitrateVideo, tamanoConTope, tamanoReintento, bytesPorMinuto } from '../comun/calidad.js';
import { elegirCodec } from '../comun/codec.js';
import { enviar, OFFSCREEN } from '../comun/mensajes.js';
import * as almacen from '../comun/almacen.js';
import {
  enCurso, activar, vigente, registrar, contexto, msGrabados, avisar, soltar, liberar, sinPendientes, descartar, fallar,
} from './contexto.js';

const DESCARTE_PRUEBA_MS = 6000; // probar_vigilante: trozos que se tiran al empezar
const PROGRESO_MS = 1000;
const ESPERA_STOP_MS = 10000; // lo más que se espera al último trozo al detener

// ---------------------------------------------------------------------------
// abrir: selector, resolución, códec, espacio y sesión
// ---------------------------------------------------------------------------

async function preparar(g) {
  let stream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: { displaySurface: g.config.fuente, frameRate: g.config.fps },
      audio: g.config.audio,
      systemAudio: 'include',
      windowAudio: 'system',
      selfBrowserSurface: 'exclude',
      surfaceSwitching: 'exclude',
    });
  } catch (e) {
    await fallar(g, e?.name === 'NotAllowedError' ? 'cancelado' : 'grabadora', String(e?.message ?? e));
    return;
  }
  if (!vigente(g)) {
    for (const pista of stream.getTracks()) pista.stop();
    return;
  }
  g.stream = stream;
  g.pista = stream.getVideoTracks()[0];
  g.pista.addEventListener('ended', () => alAcabarPista(g));

  let ajustes = g.pista.getSettings();
  const original = { ancho: ajustes.width, alto: ajustes.height };
  const tope = tamanoConTope(original.ancho, original.alto);
  if (tope.reducido) {
    await g.pista.applyConstraints({ width: tope.ancho, height: tope.alto });
    if (!vigente(g)) return;
    ajustes = g.pista.getSettings();
    avisar(g, 'reducida');
  }
  g.ancho = ajustes.width ?? tope.ancho;
  g.alto = ajustes.height ?? tope.alto;
  const conAudio = stream.getAudioTracks().length > 0;
  if (g.config.audio && !conAudio) avisar(g, 'sin_audio');

  const codec = elegirCodec({
    conAudio, plataforma: g.plataforma, permitirOpus: g.permitirOpus, esSoportado: (t) => MediaRecorder.isTypeSupported(t),
  });
  if (codec.error) {
    await fallar(g, codec.error);
    return;
  }
  g.mime = codec.mime;

  const { libre } = await almacen.espacio();
  if (!vigente(g)) return;
  if (libre < bytesPorMinuto(g.ancho, g.alto, g.config.fps, g.config.calidad, conAudio) * 60) avisar(g, 'poco_espacio');

  const superficie = ajustes.displaySurface ?? g.config.fuente;
  g.creando = almacen.crearSesion({
    id: g.sesionId,
    estado: 'grabando',
    creada: Date.now(),
    superficie,
    tituloPestana: g.tituloPestana,
    ancho: g.ancho,
    alto: g.alto,
    original: tope.reducido ? original : null,
    conAudio,
    mime: g.mime,
    avisos: [...g.avisos],
  });
  await g.creando;
  if (!vigente(g)) return; // quien lo canceló borra la sesión tras esperar a `creando`
  await enviar('captura_lista', {
    sesionId: g.sesionId,
    ancho: g.ancho,
    alto: g.alto,
    original: tope.reducido ? original : null,
    conAudio,
    superficie,
    mime: g.mime,
  });
}

// «Dejar de compartir», pestaña o ventana cerrada.
function alAcabarPista(g) {
  if (!vigente(g)) return;
  if (g.grabado) detener(g);
  else descartar(g);
}

// ---------------------------------------------------------------------------
// grabar
// ---------------------------------------------------------------------------

function empezarRecorder(g) {
  let rec = null;
  try {
    if (g.pruebaRecorderRoto) throw new Error('Recorder roto (prueba)');
    rec = new MediaRecorder(g.stream, {
      mimeType: g.mime,
      videoBitsPerSecond: bitrateVideo(g.ancho, g.alto, g.config.fps, g.config.calidad),
      audioBitsPerSecond: AUDIO_BPS,
    });
    rec.ondataavailable = (e) => alTrozo(g, rec, e.data);
    rec.onerror = (e) => alFallarRecorder(g, rec, e);
    if (g.pruebaVigilante && !g.reintentado) g.descartarHastaMs = Date.now() + DESCARTE_PRUEBA_MS;
    rec.start(TIMESLICE_MS);
  } catch (e) {
    soltar(rec);
    fallar(g, 'grabadora', String(e?.message ?? e));
    return;
  }
  g.recorder = rec;
  g.primerTrozo = false;
  g.acumuladoMs = 0;
  if (g.pausado) {
    rec.pause();
    g.desdeMs = null;
  } else {
    g.desdeMs = Date.now();
    armarVigilante(g);
  }
}

function grabar(g) {
  if (g.grabado || g.deteniendo) return;
  g.grabado = true; // desde aquí, toda salida termina con un único `terminado`
  empezarRecorder(g);
  if (vigente(g)) g.reloj = setInterval(() => alTic(g), PROGRESO_MS);
}

function alTrozo(g, rec, blob) {
  if (rec !== g.recorder || g.fin || !blob || blob.size === 0) return;
  if (Date.now() < g.descartarHastaMs) return; // solo con probar_vigilante
  g.primerTrozo = true;
  clearTimeout(g.vigilante);
  if (g.sinEspacio) return;
  const n = g.n++;
  g.escrituras = g.escrituras.then(async () => {
    if (g.sinEspacio) return;
    try {
      if (g.pruebaSinEspacio) throw new DOMException('Sin espacio (prueba)', 'QuotaExceededError');
      await almacen.anadirTrozo(g.sesionId, n, blob);
      g.bytes += blob.size;
    } catch (e) {
      // Sin espacio (o la base de datos falla): se para y se conserva lo escrito.
      g.sinEspacio = true;
      const codigo = e?.name === 'QuotaExceededError' ? 'sin_espacio' : 'grabadora';
      enviar('error', { sesionId: g.sesionId, codigo, detalle: String(e?.message ?? e) }).catch(registrar('error'));
      detener(g); // sin await: detener espera a esta misma cadena
    }
  });
}

function alFallarRecorder(g, rec, e) {
  if (rec !== g.recorder || !vigente(g)) return;
  enviar('error', { sesionId: g.sesionId, codigo: 'grabadora', detalle: String(e?.error?.message ?? 'MediaRecorder') })
    .catch(registrar('error'));
  detener(g);
}

function alTic(g) {
  if (!vigente(g) || g.deteniendo) return;
  const ms = msGrabados(g);
  enviar('progreso', { sesionId: g.sesionId, ms, bytes: g.bytes }).catch(registrar('progreso'));
  if (!g.avisadoFin && ms >= g.limites.avisoMs) {
    g.avisadoFin = true;
    avisar(g, 'quedan_5_min');
  }
  if (ms >= g.limites.maxMs) detener(g);
}

// Vigilante: sin primer trozo en VIGILANTE_MS se reintenta una vez más pequeño.
function armarVigilante(g) {
  clearTimeout(g.vigilante);
  g.vigilante = setTimeout(() => {
    alVigilante(g).catch((e) => fallar(g, 'grabadora', String(e?.message ?? e)));
  }, VIGILANTE_MS);
}

async function alVigilante(g) {
  if (!vigente(g) || g.primerTrozo || g.deteniendo || g.pausado) return;
  if (g.reintentado) {
    await fallar(g, 'resolucion');
    return;
  }
  g.reintentado = true;
  const viejo = g.recorder;
  g.recorder = null; // lo que aún suelte el viejo no se escribe
  soltar(viejo);
  const t = tamanoReintento(g.ancho, g.alto);
  await g.pista.applyConstraints({ width: t.ancho, height: t.alto });
  if (!vigente(g) || g.deteniendo) return;
  const ajustes = g.pista.getSettings();
  g.ancho = ajustes.width ?? t.ancho;
  g.alto = ajustes.height ?? t.alto;
  avisar(g, 'reintento', { ancho: g.ancho, alto: g.alto });
  almacen.actualizarSesion(g.sesionId, { ancho: g.ancho, alto: g.alto, avisos: [...g.avisos] })
    .catch(registrar('actualizar la sesión'));
  empezarRecorder(g);
}

// ---------------------------------------------------------------------------
// pausar, reanudar, detener
// ---------------------------------------------------------------------------

function pausar(g) {
  if (g.pausado || g.deteniendo) return;
  g.pausado = true;
  clearTimeout(g.vigilante);
  if (g.recorder?.state === 'recording') g.recorder.pause();
  g.acumuladoMs = msGrabados(g);
  g.desdeMs = null;
  enviar('progreso', { sesionId: g.sesionId, ms: g.acumuladoMs, bytes: g.bytes }).catch(registrar('progreso'));
}

function reanudar(g) {
  if (!g.pausado || g.deteniendo) return;
  g.pausado = false;
  if (g.recorder?.state === 'paused') g.recorder.resume();
  if (g.recorder) {
    g.desdeMs = Date.now();
    if (!g.primerTrozo) armarVigilante(g);
  }
}

// Para el recorder, espera al último trozo escrito, cierra la sesión y avisa. Idempotente.
function detener(g) {
  if (!vigente(g)) return Promise.resolve();
  if (!g.recorder && !g.deteniendo) return descartar(g); // nada grabado (p. ej. entre reintentos)
  g.deteniendo ??= (async () => {
    clearInterval(g.reloj);
    clearTimeout(g.vigilante);
    const duracionMs = msGrabados(g);
    let hayVideo = false;
    try {
      const rec = g.recorder;
      if (rec.state !== 'inactive') {
        // Con tope: un codificador colgado no debe dejar la captura abierta para siempre.
        await Promise.race([
          new Promise((resolver) => { rec.addEventListener('stop', resolver, { once: true }); rec.stop(); }),
          new Promise((resolver) => { setTimeout(resolver, ESPERA_STOP_MS); }),
        ]);
      }
      await sinPendientes(g);
      hayVideo = g.bytes > 0;
    } finally {
      g.fin = true;
      liberar(g);
    }
    if (hayVideo) {
      await almacen.actualizarSesion(g.sesionId, {
        estado: 'terminada', duracionMs, bytes: g.bytes, ancho: g.ancho, alto: g.alto, avisos: [...g.avisos],
      }).catch(registrar('actualizar la sesión'));
    } else {
      await almacen.borrarSesion(g.sesionId).catch(registrar('borrar la sesión'));
    }
    await enviar('progreso', { sesionId: g.sesionId, ms: duracionMs, bytes: g.bytes }).catch(registrar('progreso'));
    await enviar('terminado', { sesionId: g.sesionId, hayVideo }).catch(registrar('terminado'));
  })();
  return g.deteniendo;
}

// ---------------------------------------------------------------------------
// Mensajes del orquestador
// ---------------------------------------------------------------------------

// Contexto en curso de esa sesión, o null.
const de = (m) => { const g = enCurso(); return vigente(g) && g.sesionId === m.sesionId ? g : null; };
const conContexto = (fn) => (m) => { const g = de(m); if (g) return fn(g); return undefined; };

const ORDENES = Object.freeze({
  abrir(m) {
    const anterior = enCurso();
    if (anterior && !anterior.fin) {
      anterior.fin = true;
      liberar(anterior);
    }
    const g = contexto(m);
    activar(g);
    // No se espera: el selector puede estar abierto mucho rato.
    preparar(g).catch((e) => fallar(g, 'grabadora', String(e?.message ?? e)));
  },
  grabar: conContexto(grabar),
  pausar: conContexto(pausar),
  reanudar: conContexto(reanudar),
  detener: conContexto((g) => { detener(g); }), // contesta ya; el final llega con `terminado`
  // Contesta cuando la sesión está borrada; sin `terminado`: el orquestador ya está en reposo.
  cancelar: conContexto((g) => descartar(g, { avisar: false })),
  // Solo de prueba.
  probar_fin: conContexto((g) => {
    if (!g.modoPrueba || !g.pista) return;
    g.pista.stop(); // stop() no lanza `ended`: se simula lo que hace Chrome
    g.pista.dispatchEvent(new Event('ended'));
  }),
  probar_vigilante: conContexto((g) => { if (g.modoPrueba) g.pruebaVigilante = true; }),
  probar_sin_espacio: conContexto((g) => { if (g.modoPrueba) g.pruebaSinEspacio = true; }),
  probar_recorder_roto: conContexto((g) => { if (g.modoPrueba) g.pruebaRecorderRoto = true; }),
});

chrome.runtime.onMessage.addListener((m, remitente, responder) => {
  if (m?.destino !== OFFSCREEN || remitente.id !== chrome.runtime.id) return false;
  if (!Object.hasOwn(ORDENES, m.tipo)) return false;
  Promise.resolve()
    .then(() => ORDENES[m.tipo](m))
    .then(() => responder({ ok: true }), (e) => {
      registrar(m.tipo)(e);
      responder({ ok: false, error: String(e?.message ?? e) });
    });
  return true;
});
