// Vista previa y recuperación de grabaciones que nadie ha guardado ni descartado:
// las que se cortaron (Chrome se cerró, la grabadora murió) y las terminadas cuya
// vista se cerró. Sin estado propio: lo que hace falta recordar va a chrome.storage.session.
import * as almacen from '../comun/almacen.js';

const VISTA = 'vista/vista.html';
// Vistas abiertas hace muy poco: {sesionId: ms}. Una pestaña recién creada aún no
// aparece en getContexts mientras carga; así no se abre dos veces la misma.
const CLAVE_RECIENTES = 'vistasRecientes';
const RECIENTE_MS = 30000;

export function urlVista(sesionId, { recuperada = false } = {}) {
  const consulta = new URLSearchParams({ sesion: sesionId });
  if (recuperada) consulta.set('recuperada', '1');
  return chrome.runtime.getURL(`${VISTA}?${consulta}`);
}

async function recientes() {
  const { [CLAVE_RECIENTES]: todas = {} } = await chrome.storage.session.get(CLAVE_RECIENTES);
  const ahora = Date.now();
  return Object.fromEntries(Object.entries(todas).filter(([, ms]) => ahora - ms < RECIENTE_MS));
}

export async function abrirVista(sesionId, opciones) {
  await chrome.storage.session.set({ [CLAVE_RECIENTES]: { ...await recientes(), [sesionId]: Date.now() } });
  await chrome.tabs.create({ url: urlVista(sesionId, opciones) });
}

// Sesiones con una vista abierta. Sin el permiso `tabs` no se ven las URL de las
// pestañas, pero getContexts sí da las páginas de la propia extensión.
async function vistasAbiertas() {
  const base = chrome.runtime.getURL(VISTA);
  const contextos = await chrome.runtime.getContexts({ contextTypes: ['TAB'] });
  const ids = new Set(Object.keys(await recientes()));
  for (const { documentUrl } of contextos) {
    if (!String(documentUrl ?? '').startsWith(base)) continue;
    const id = new URL(documentUrl).searchParams.get('sesion');
    if (id) ids.add(id);
  }
  return ids;
}

// Llamar solo sin grabación en marcha (si no, su sesión `grabando` se tomaría por
// huérfana). Abre cada sesión pendiente en una vista «recuperada»; borra las vacías y
// las ya guardadas. Devuelve los ids que ha abierto.
export async function recuperarSesiones() {
  const abiertas = await vistasAbiertas();
  const abiertasAhora = [];
  for (const sesion of await almacen.listarSesiones()) {
    if (abiertas.has(sesion.id)) continue;
    try {
      if (sesion.estado === 'guardada' || (await almacen.contarTrozos(sesion.id)) === 0) {
        await almacen.borrarSesion(sesion.id);
        continue;
      }
      // Cortada a medias: le falta el final, pero lo escrito es un MP4 válido.
      if (sesion.estado === 'grabando') await almacen.actualizarSesion(sesion.id, { estado: 'terminada', cortada: true });
      else if (sesion.estado !== 'terminada') continue;
      await abrirVista(sesion.id, { recuperada: true });
      abiertasAhora.push(sesion.id);
    } catch (e) {
      console.error(`Grabador: no se pudo recuperar la sesión ${sesion.id}`, e);
    }
  }
  return abiertasAhora;
}
