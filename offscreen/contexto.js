// Contexto de una grabación en el offscreen y sus salidas: liberar(), descartar()
// (sin vídeo) y fallar() (error). Todas las salidas pasan por liberar().
import { enviar } from '../comun/mensajes.js';
import * as almacen from '../comun/almacen.js';

// La grabación en curso (una a la vez). Cada `abrir` crea un contexto nuevo; los
// callbacks de un contexto viejo se reconocen con vigente() y no hacen nada.
let actual = null;

export const enCurso = () => actual;
export function activar(g) { actual = g; }

export const vigente = (g) => g !== null && g === actual && !g.fin;
export const registrar = (que) => (e) => console.error(`Grabadora: ${que}`, e);

export function contexto(m) {
  return {
    sesionId: m.sesionId,
    config: m.config,
    permitirOpus: m.permitirOpus === true,
    modoPrueba: m.modoPrueba === true,
    limites: m.limites,
    plataforma: String(m.plataforma ?? ''),
    tituloPestana: String(m.tituloPestana ?? ''),
    stream: null,
    pista: null,
    recorder: null,
    mime: null,
    ancho: 0,
    alto: 0,
    avisos: [],
    creando: null, // promesa de crearSesion en curso
    grabado: false, // ha llegado `grabar`: desde aquí toda salida manda un `terminado`
    n: 0,
    bytes: 0,
    escrituras: Promise.resolve(), // cadena de anadirTrozo, en orden
    sinEspacio: false,
    primerTrozo: false,
    reintentado: false,
    pausado: false,
    acumuladoMs: 0,
    desdeMs: null,
    avisadoFin: false,
    vigilante: null,
    reloj: null,
    deteniendo: null,
    pruebaVigilante: false,
    pruebaSinEspacio: false, // el siguiente anadirTrozo lanza QuotaExceededError
    pruebaRecorderRoto: false, // el MediaRecorder no se puede crear
    descartarHastaMs: 0,
    fin: false,
  };
}

export const msGrabados = (g) => g.acumuladoMs + (g.desdeMs === null ? 0 : Date.now() - g.desdeMs);

export function avisar(g, codigo, extra = {}) {
  if (!g.avisos.includes(codigo)) g.avisos.push(codigo);
  enviar('aviso', { sesionId: g.sesionId, codigo, ...extra }).catch(registrar('aviso'));
}

export function soltar(rec) {
  if (!rec) return;
  rec.ondataavailable = null;
  rec.onerror = null;
  if (rec.state !== 'inactive') {
    try { rec.stop(); } catch (e) { registrar('parar el recorder')(e); }
  }
}

// Suelta todo lo que retiene la captura. Idempotente; la llaman todos los caminos de salida.
export function liberar(g = actual) {
  if (!g) return;
  clearInterval(g.reloj);
  clearTimeout(g.vigilante);
  g.reloj = null;
  g.vigilante = null;
  soltar(g.recorder);
  for (const pista of g.stream?.getTracks() ?? []) pista.stop();
  g.stream = null;
  g.pista = null;
  g.recorder = null;
}

// Espera a que no quede nada a medio escribir de la sesión.
export async function sinPendientes(g) {
  await g.creando?.catch(() => {});
  await g.escrituras;
}

// Sin vídeo: se suelta la captura, se borra la sesión y se avisa con terminado.
// Con `avisar: false` (orden `cancelar`) no se manda: el orquestador ya está en reposo.
export async function descartar(g, { avisar = true } = {}) {
  if (!vigente(g)) return;
  g.fin = true;
  liberar(g);
  await sinPendientes(g);
  await almacen.borrarSesion(g.sesionId).catch(registrar('borrar la sesión'));
  if (avisar) await enviar('terminado', { sesionId: g.sesionId, hayVideo: false }).catch(registrar('terminado'));
}

// Error que acaba con la grabación sin vídeo (selector, códec, recorder, resolución).
// Si ya se está deteniendo, detener() es quien manda el final con lo grabado.
export async function fallar(g, codigo, detalle = null) {
  if (!vigente(g) || g.deteniendo) return;
  g.fin = true;
  liberar(g);
  await sinPendientes(g);
  await almacen.borrarSesion(g.sesionId).catch(registrar('borrar la sesión'));
  await enviar('error', { sesionId: g.sesionId, codigo, detalle }).catch(registrar('error'));
  // Tras `grabar`, el orquestador está en `cerrando` y espera el final.
  if (g.grabado) await enviar('terminado', { sesionId: g.sesionId, hayVideo: false }).catch(registrar('terminado'));
}
