// Orquestador de la grabación. Sin estado en variables de módulo: todo se lee y
// escribe en chrome.storage.session (el service worker puede dormirse).
import { transicion, accionAtajo, estadoInicial } from './estado.js';
import { CONFIG_DEFECTO, CUENTA_S, AVISO_MS, MAX_MS } from '../comun/config.js';
import { FACTORES, formatoTiempo } from '../comun/calidad.js';
import { enviar, OFFSCREEN, AL_ORQUESTADOR, AVISOS } from '../comun/mensajes.js';
import * as almacen from '../comun/almacen.js';

const CLAVE = 'estado';
const URL_GRABADORA = 'offscreen/grabadora.html';
const ESPERA_CANCELAR_MS = 5000;
const COLOR = Object.freeze({ grabando: '#C8302B', en_pausa: '#8A5A00', cuenta_atras: '#2E86AB' });
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
  return nuevo;
}

// Lee, usa transicion(); si no está permitido, lo registra y devuelve null.
// Si `cambios.sesionId` viene y no es la sesión en curso, es un mensaje viejo.
export function aplicar(evento, cambios = {}) {
  return enCola(async () => {
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
    await actualizarInsignia(nuevo);
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
  await actualizarInsignia(estado);
  switch (estado.fase) {
    case 'eligiendo': await abrirGrabadora(estado); break;
    case 'cuenta_atras': programarCuenta(estado.sesionId, estado.cuentaFinMs); break;
    case 'grabando': await ordenar(evento === 'cuenta_fin' ? 'grabar' : 'reanudar', estado); break;
    case 'en_pausa': await ordenar('pausar', estado); break;
    case 'cerrando': await ordenar('detener', estado); break;
    case 'inactivo': await cerrarGrabadora(estado, evento, cambios); break;
    default: break;
  }
}

function ordenar(tipo, estado, datos = {}) {
  return enviar(tipo, { ...datos, destino: OFFSCREEN, sesionId: estado.sesionId }).catch((e) => {
    console.error(`Grabador: no se pudo enviar «${tipo}» a la grabadora`, e);
  });
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
function programarCuenta(sesionId, finMs) {
  const tic = async () => {
    const estado = await leerEstado();
    if (estado.fase !== 'cuenta_atras' || estado.sesionId !== sesionId) return;
    const restante = finMs - Date.now();
    if (restante <= 25) {
      await aplicar('cuenta_fin', { sesionId });
      return;
    }
    await actualizarInsignia(estado);
    setTimeout(tic, ((restante - 1) % 1000) + 1);
  };
  setTimeout(tic, Math.max(0, ((finMs - Date.now() - 1) % 1000) + 1));
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
    const url = chrome.runtime.getURL(`vista/vista.html?sesion=${encodeURIComponent(estado.sesionId)}`);
    await chrome.tabs.create({ url }).catch((e) => console.error('Grabador: no se pudo abrir la vista', e));
  }
}

function textoInsignia(estado) {
  switch (estado.fase) {
    case 'grabando': return formatoTiempo(estado.ms);
    case 'en_pausa': return 'II';
    case 'cuenta_atras':
      return String(Math.max(1, Math.ceil(((estado.cuentaFinMs ?? Date.now()) - Date.now()) / 1000)));
    default: return '';
  }
}

export async function actualizarInsignia(estado) {
  const texto = textoInsignia(estado);
  const color = COLOR[estado.fase];
  if (color) await chrome.action.setBadgeBackgroundColor({ color });
  await chrome.action.setBadgeText({ text: texto });
}

// ---------------------------------------------------------------------------
// Mensajes y atajos
// ---------------------------------------------------------------------------

const ORDENES = new Set(['pausar', 'reanudar', 'detener', 'cancelar']);
const DE_GRABADORA = new Set(['captura_lista', 'terminado', 'error']);

function atender(m, remitente) {
  const deLaExtension = remitente.id === chrome.runtime.id
    && String(remitente.url ?? '').startsWith(chrome.runtime.getURL(''));
  const deLaGrabadora = deLaExtension && remitente.url.startsWith(chrome.runtime.getURL(URL_GRABADORA));
  const { tipo } = m;
  if (tipo === AL_ORQUESTADOR.iniciar && deLaExtension && !deLaGrabadora) {
    return aplicar('iniciar', { config: m.config, tituloPestana: m.tituloPestana, pestanaId: m.pestanaId });
  }
  if (ORDENES.has(tipo) && remitente.id === chrome.runtime.id && !deLaGrabadora) return aplicar(tipo);
  if (!deLaGrabadora || typeof m.sesionId !== 'string') return null;
  if (DE_GRABADORA.has(tipo)) return aplicar(tipo, m);
  if (tipo === AL_ORQUESTADOR.progreso) return progreso(m);
  if (tipo === AL_ORQUESTADOR.aviso && AVISOS.includes(m.codigo)) return aviso(m);
  return null;
}

chrome.runtime.onMessage.addListener((m, remitente, responder) => {
  if (!m || typeof m.tipo !== 'string' || m.destino) return false; // no es para el orquestador
  const resultado = atender(m, remitente);
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

// Para el arnés de pruebas (y la recuperación de la Tarea 10).
self.grabador = { aplicar, leerEstado, almacen };
