// Orquestador de la grabación. Sin estado en variables de módulo: todo se lee y
// escribe en chrome.storage.session (el service worker puede dormirse).
import { transicion, accionAtajo, estadoInicial } from './estado.js';
import { CONFIG_DEFECTO, CUENTA_S, AVISO_MS, MAX_MS } from '../comun/config.js';
import { FACTORES } from '../comun/calidad.js';
import { enviar, OFFSCREEN, AL_ORQUESTADOR, AVISOS } from '../comun/mensajes.js';
import * as almacen from '../comun/almacen.js';
import * as superposicion from './superposicion.js';
import { iconosDeFase, textoInsignia, COLOR_INSIGNIA } from './indicadores.js';
import { abrirVista, recuperarSesiones } from './recuperacion.js';

const CLAVE = 'estado';
const URL_GRABADORA = 'offscreen/grabadora.html';
const ESPERA_CANCELAR_MS = 5000;
const FUENTES = Object.freeze(['browser', 'window', 'monitor']);
const FPS = Object.freeze([30, 60]);

// Cola de promesas: cada cambio de estado se aplica entero (leer, decidir,
// guardar, efectos) antes del siguiente. Es la única referencia de módulo y no
// guarda estado de la grabación.
const cola = { p: Promise.resolve() };

function enCola(trabajo) {
  const resultado = cola.p.then(trabajo);
  cola.p = resultado.catch(() => {});
  return resultado;
}

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------

export async function leerEstado() {
  const { [CLAVE]: estado } = await chrome.storage.session.get(CLAVE);
  return estado ?? estadoInicial();
}

export function guardarEstado(estado) {
  return chrome.storage.session.set({ [CLAVE]: estado });
}

function normalizarConfig(c) {
  const d = CONFIG_DEFECTO;
  return {
    fuente: FUENTES.includes(c?.fuente) ? c.fuente : d.fuente,
    audio: typeof c?.audio === 'boolean' ? c.audio : d.audio,
    calidad: Object.hasOwn(FACTORES, c?.calidad ?? '') ? c.calidad : d.calidad,
    fps: FPS.includes(c?.fps) ? c.fps : d.fps,
  };
}

// Estado nuevo tras un evento permitido (sin efectos).
function siguiente(estado, evento, fase, cambios) {
  if (evento === 'iniciar') {
    return {
      ...estadoInicial(),
      fase,
      sesionId: crypto.randomUUID(),
      config: normalizarConfig(cambios.config),
      tituloPestana: String(cambios.tituloPestana ?? ''),
      pestanaId: Number.isInteger(cambios.pestanaId) ? cambios.pestanaId : null,
    };
  }
  const nuevo = { ...estado, fase };
  if (evento === 'captura_lista') {
    const { ancho, alto, original, conAudio, superficie, mime } = cambios;
    Object.assign(nuevo, { ancho, alto, original: original ?? null, conAudio: !!conAudio, superficie, mime });
    nuevo.cuentaFinMs = Date.now() + CUENTA_S * 1000;
  }
  if (evento === 'cuenta_fin') nuevo.inicioMs = Date.now();
  if (evento === 'error') nuevo.error = { codigo: String(cambios.codigo), detalle: cambios.detalle ?? null };
  // Una grabación que llegó a grabar y acaba sin un solo trozo (parada casi al instante):
  // no hay vista previa, así que se dice. Cancelar o no llegar a grabar no es un error.
  if (evento === 'terminado' && cambios.hayVideo === false && !estado.error
    && ['grabando', 'en_pausa', 'cerrando'].includes(estado.fase)) {
    nuevo.error = { codigo: 'sin_video', detalle: null };
  }
  return nuevo;
}

// Lee, usa transicion(); si no está permitido, lo registra y devuelve null.
// Si `cambios.sesionId` viene y no es la sesión en curso, es un mensaje viejo.
export function aplicar(evento, cambios = {}) {
  return enCola(async () => {
    if (evento === 'iniciar') await recuperarSiColgada(); // no empezar encima de una colgada
    const estado = await leerEstado();
    if (cambios.sesionId !== undefined && cambios.sesionId !== estado.sesionId) {
      console.warn(`Grabador: «${evento}» de otra sesión (${cambios.sesionId}); se ignora`);
      return null;
    }
    const fase = transicion(estado.fase, evento);
    if (!fase) {
      console.warn(`Grabador: transición no permitida: ${estado.fase} + ${evento}`);
      return null;
    }
    const nuevo = siguiente(estado, evento, fase, cambios);
    await guardarEstado(nuevo);
    await efectos(nuevo, evento, cambios);
    return nuevo;
  });
}

// Cambios sin transición (progreso, avisos) de la sesión en curso.
function anotar(sesionId, fases, cambiar) {
  return enCola(async () => {
    const estado = await leerEstado();
    if (sesionId !== estado.sesionId || !fases.includes(estado.fase)) return null;
    const nuevo = cambiar(estado);
    await guardarEstado(nuevo);
    await actualizarIndicadores(nuevo);
    return nuevo;
  });
}

const progreso = ({ sesionId, ms, bytes }) => anotar(sesionId, ['grabando', 'en_pausa', 'cerrando'],
  (e) => ({ ...e, ms: Number(ms) || 0, bytes: Number(bytes) || 0 }));

const aviso = ({ sesionId, codigo, ancho, alto }) => anotar(sesionId,
  ['eligiendo', 'cuenta_atras', 'grabando', 'en_pausa', 'cerrando'], (e) => {
    const nuevo = { ...e, avisos: e.avisos.includes(codigo) ? e.avisos : [...e.avisos, codigo] };
    if (Number.isInteger(ancho) && Number.isInteger(alto)) Object.assign(nuevo, { ancho, alto });
    return nuevo;
  });

// ---------------------------------------------------------------------------
// Efectos
// ---------------------------------------------------------------------------

async function efectos(estado, evento, cambios) {
  await actualizarIcono(estado);
  await actualizarIndicadores(estado);
  switch (estado.fase) {
    case 'eligiendo': await abrirGrabadora(estado); break;
    case 'cuenta_atras':
      inyectarSuperposicion(estado.sesionId);
      programarCuenta(estado.sesionId, estado.cuentaFinMs);
      break;
    case 'grabando': await ordenarORecuperar(evento === 'cuenta_fin' ? 'grabar' : 'reanudar', estado); break;
    case 'en_pausa': await ordenarORecuperar('pausar', estado); break;
    case 'cerrando': await ordenarORecuperar('detener', estado); break;
    case 'inactivo': await cerrarGrabadora(estado, evento, cambios); break;
    default: break;
  }
}

function ordenar(tipo, estado, datos = {}) {
  return enviar(tipo, { ...datos, destino: OFFSCREEN, sesionId: estado.sesionId }).catch((e) => {
    console.error(`Grabador: no se pudo enviar «${tipo}» a la grabadora`, e);
  });
}

// Si la grabadora no contesta porque ya no existe, nadie mandará `terminado`: se
// recupera ya (reposo y vista «recuperada») en lugar de dejar la fase colgada.
// Dentro de la cola.
async function ordenarORecuperar(tipo, estado) {
  if (await ordenar(tipo, estado)) return;
  await recuperarSiColgada();
}

const hayGrabadora = async () =>
  (await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] })).length > 0;

async function cerrarDocumento() {
  if (await hayGrabadora()) await chrome.offscreen.closeDocument().catch(() => {});
}

// Lo que solo pone el arnés de pruebas en chrome.storage.local (el offscreen no lo puede leer).
async function opcionesPrueba() {
  const { modoPrueba, limitesPrueba } = await chrome.storage.local.get(['modoPrueba', 'limitesPrueba']);
  const prueba = modoPrueba === true;
  const limites = { avisoMs: AVISO_MS, maxMs: MAX_MS };
  if (prueba && limitesPrueba) {
    if (Number(limitesPrueba.avisoMs) > 0) limites.avisoMs = Number(limitesPrueba.avisoMs);
    if (Number(limitesPrueba.maxMs) > 0) limites.maxMs = Number(limitesPrueba.maxMs);
  }
  return { prueba, limites };
}

async function abrirGrabadora(estado) {
  try {
    const { prueba, limites } = await opcionesPrueba();
    await cerrarDocumento(); // restos de una grabación anterior
    await chrome.offscreen.createDocument({
      url: URL_GRABADORA,
      reasons: ['DISPLAY_MEDIA'],
      justification: 'Abrir el selector de Chrome y grabar lo que elija el usuario',
    });
    // El offscreen no tiene chrome.runtime.getPlatformInfo: se le pasa el sistema.
    const { os: plataforma } = await chrome.runtime.getPlatformInfo();
    const datos = {
      config: estado.config, permitirOpus: prueba, modoPrueba: prueba, limites, plataforma,
      tituloPestana: estado.tituloPestana,
    };
    // El documento suele contestar a la primera; por si su script aún no ha cargado, se reintenta.
    for (let intento = 0; intento < 20; intento++) {
      if (await ordenar('abrir', estado, datos)) return;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error('La grabadora no contesta');
  } catch (e) {
    console.error('Grabador: no se pudo abrir la grabadora', e);
    // Fuera de la cola actual: se aplica en cuanto termine este cambio.
    aplicar('error', { sesionId: estado.sesionId, codigo: 'grabadora', detalle: String(e?.message ?? e) });
  }
}

// Cuenta atrás: un setTimeout por segundo hasta cuentaFinMs, y entonces cuenta_fin.
// Cada tic va en la cola: un Cancelar (o «Dejar de compartir») que llegue a la vez se
// aplica antes o después entero, y no deja un número viejo en la insignia ni en la página.
function programarCuenta(sesionId, finMs) {
  const tic = async () => {
    const restante = await enCola(async () => {
      const estado = await leerEstado();
      if (estado.fase !== 'cuenta_atras' || estado.sesionId !== sesionId) return null;
      const quedan = finMs - Date.now();
      if (quedan > 25) await actualizarIndicadores(estado);
      return quedan;
    });
    if (restante === null) return;
    // Fuera de la cola actual: aplicar() pone el suyo detrás (y comprueba la sesión).
    if (restante <= 25) await aplicar('cuenta_fin', { sesionId });
    else setTimeout(siguienteTic, ((restante - 1) % 1000) + 1);
  };
  const siguienteTic = () => { tic().catch((e) => console.error('Grabador: cuenta atrás', e)); };
  setTimeout(siguienteTic, Math.max(0, ((finMs - Date.now() - 1) % 1000) + 1));
}

async function cerrarGrabadora(estado, evento, cambios) {
  // Salvo con `terminado` (la grabadora ya ha acabado), se le pide que suelte la
  // captura y borre la sesión antes de cerrar el documento.
  if (evento !== 'terminado' && await hayGrabadora()) {
    await Promise.race([
      ordenar('cancelar', estado),
      new Promise((r) => setTimeout(r, ESPERA_CANCELAR_MS)),
    ]);
  }
  await cerrarDocumento();
  if (evento === 'terminado' && cambios.hayVideo === true) {
    await abrirVista(estado.sesionId).catch((e) => console.error('Grabador: no se pudo abrir la vista', e));
  }
}

// ---------------------------------------------------------------------------
// Recuperación
// ---------------------------------------------------------------------------

// Una fase activa sin grabadora viva no acabará nunca (Chrome cerró el documento y
// nadie mandará `terminado`): vuelve a reposo. Dentro de la cola. Devuelve false si
// hay una grabación en marcha.
async function sanearFase() {
  const estado = await leerEstado();
  if (estado.fase === 'inactivo') return true;
  if (await hayGrabadora()) return false;
  console.warn(`Grabador: fase «${estado.fase}» sin grabadora; se vuelve a reposo`);
  const nuevo = { ...estado, fase: 'inactivo' };
  await guardarEstado(nuevo);
  await actualizarIcono(nuevo);
  await actualizarIndicadores(nuevo);
  return true;
}

// Dentro de la cola: solo si la fase se había quedado colgada. Con la grabadora
// viva no toca nada.
async function recuperarSiColgada() {
  if ((await leerEstado()).fase === 'inactivo') return;
  if (await sanearFase()) await recuperarSesiones();
}

// Al abrir Chrome o instalar: todo lo que quedó sin guardar ni descartar.
// Devuelve los ids de las vistas abiertas.
export function recuperarHuerfanas() {
  return enCola(async () => ((await sanearFase()) ? recuperarSesiones() : []));
}

async function actualizarInsignia(estado) {
  const texto = textoInsignia(estado);
  const color = COLOR_INSIGNIA[estado.fase];
  if (color) await chrome.action.setBadgeBackgroundColor({ color });
  await chrome.action.setBadgeText({ text: texto });
}

// El icono solo cambia con la fase, así que se pone aquí (en cada transición) y no
// en cada avance del tiempo. Un fallo al pintarlo nunca afecta a la grabación.
async function actualizarIcono(estado) {
  try {
    await chrome.action.setIcon({ path: iconosDeFase(estado.fase) });
  } catch (e) {
    console.warn('Grabador: no se pudo cambiar el icono', e);
  }
}

// Insignia del icono y superposición de la pestaña: los dos siguen al estado.
async function actualizarIndicadores(estado) {
  superposicion.avisar(estado);
  await actualizarInsignia(estado);
}

// Sin esperar (executeScript puede tardar en una pestaña que carga). Mirar si sigue
// vigente y avisar con el estado de ENTONCES van en la cola, para que un Cancelar a la
// vez no deje en la página un círculo de cuenta atrás que ya no corresponde. Inyectar
// no: con la pestaña cargando, frenaría el Cancelar.
const FASES_SUPERPOSICION = Object.freeze(['cuenta_atras', 'grabando', 'en_pausa']);

function inyectarSuperposicion(sesionId) {
  enCola(async () => {
    const estado = await leerEstado();
    return estado.sesionId === sesionId && FASES_SUPERPOSICION.includes(estado.fase) ? estado : null;
  }).then(async (estado) => {
    if (!estado || !(await superposicion.inyectar(estado))) return;
    await enCola(async () => superposicion.avisar(await leerEstado()));
  }).catch(() => {});
}

// ---------------------------------------------------------------------------
// Mensajes y atajos
// ---------------------------------------------------------------------------

const ORDENES = new Set(['pausar', 'reanudar', 'detener', 'cancelar']);
const DE_GRABADORA = new Set(['captura_lista', 'terminado', 'error']);

const esDeLaExtension = (remitente) => remitente.id === chrome.runtime.id
  && String(remitente.url ?? '').startsWith(chrome.runtime.getURL(''));
const esDeLaGrabadora = (remitente) => esDeLaExtension(remitente)
  && remitente.url.startsWith(chrome.runtime.getURL(URL_GRABADORA));

// Órdenes del popup, la superposición o los atajos: se contesta con el estado nuevo.
function deFuera(m, remitente) {
  if (m.tipo === AL_ORQUESTADOR.iniciar && esDeLaExtension(remitente)) {
    return aplicar('iniciar', { config: m.config, tituloPestana: m.tituloPestana, pestanaId: m.pestanaId });
  }
  if (ORDENES.has(m.tipo) && remitente.id === chrome.runtime.id) return aplicar(m.tipo);
  if (m.tipo === AL_ORQUESTADOR.revisar && esDeLaExtension(remitente)) return enCola(recuperarSiColgada).then(leerEstado);
  return null;
}

// Noticias de la grabadora.
function deGrabadora(m) {
  if (typeof m.sesionId !== 'string') return null;
  if (DE_GRABADORA.has(m.tipo)) return aplicar(m.tipo, m);
  if (m.tipo === AL_ORQUESTADOR.progreso) return progreso(m);
  if (m.tipo === AL_ORQUESTADOR.aviso && AVISOS.includes(m.codigo)) return aviso(m);
  return null;
}

chrome.runtime.onMessage.addListener((m, remitente, responder) => {
  if (!m || typeof m.tipo !== 'string' || m.destino) return false; // no es para el orquestador
  if (esDeLaGrabadora(remitente)) {
    // Se contesta ya, sin esperar a la cola: la cola puede estar esperando a la
    // propia grabadora (p. ej. a que conteste a `cancelar`) y se bloquearían.
    const trabajo = deGrabadora(m);
    if (!trabajo) return false;
    trabajo.catch((e) => console.error('Grabador:', e));
    responder({ ok: true });
    return false;
  }
  const resultado = deFuera(m, remitente);
  if (!resultado) return false;
  resultado.then(responder, (e) => { console.error('Grabador:', e); responder(null); });
  return true;
});

async function atajo(comando, pestana) {
  const { fase } = await leerEstado();
  const evento = accionAtajo(fase, comando);
  if (!evento) return null;
  if (evento !== 'iniciar') return aplicar(evento);
  const { config } = await chrome.storage.local.get('config');
  return aplicar('iniciar', { config, tituloPestana: pestana?.title ?? '', pestanaId: pestana?.id ?? null });
}

chrome.commands.onCommand.addListener((comando, pestana) => {
  atajo(comando, pestana).catch((e) => console.error('Grabador: atajo', e));
});

const alFallarRecuperacion = (e) => console.error('Grabador: recuperación', e);
chrome.runtime.onStartup.addListener(() => { recuperarHuerfanas().catch(alFallarRecuperacion); });
chrome.runtime.onInstalled.addListener(() => { recuperarHuerfanas().catch(alFallarRecuperacion); });
// Cada vez que el service worker despierta: una fase colgada no espera a reiniciar Chrome.
enCola(recuperarSiColgada).catch(alFallarRecuperacion);

// Para el arnés de pruebas.
self.grabador = { aplicar, leerEstado, almacen, recuperarHuerfanas };
