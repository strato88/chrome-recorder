// Vista previa de una grabación: ver el vídeo con sus datos reales, guardarlo con
// «Guardar como» o descartarlo. También abre las grabaciones recuperadas.
// No escucha mensajes de chrome.runtime: el orquestador y la grabadora los difunden
// a todas las páginas y esta no tiene nada que contestar.
import * as almacen from '../comun/almacen.js';
import { nombreArchivo } from '../comun/nombre.js';
import { formatoTiempo, formatoPeso } from '../comun/calidad.js';

const $ = (id) => document.getElementById(id);
const texto = (clave, ...sustituciones) => chrome.i18n.getMessage(clave, sustituciones.map(String));
const resolucion = (ancho, alto) => `${ancho}×${alto}`;
const ESPERA_DURACION_MS = 3000;

// Motivo corto, en claro, de un fallo al guardar (por el nombre del error).
const MOTIVOS = {
  AbortError: null,
  NotAllowedError: 'vistaMotivoPermiso',
  SecurityError: 'vistaMotivoPermiso',
  QuotaExceededError: 'vistaMotivoEspacio',
  NoModificationAllowedError: 'vistaMotivoEnUso',
  InvalidModificationError: 'vistaMotivoEnUso',
  InvalidStateError: 'vistaMotivoEnUso',
  NotReadableError: 'vistaMotivoLeer',
  NotFoundError: 'vistaMotivoLeer',
};
const motivo = (e) => texto(MOTIVOS[e?.name] ?? 'vistaMotivoOtro');

// Por qué acabó la grabación, cuando no la paró el usuario (lo anota la grabadora).
const FINES = { sin_espacio: 'vistaFinSinEspacio', grabadora: 'vistaFinGrabadora', limite: 'vistaFinLimite' };

const vista = { id: null, recuperada: false, sesion: null, trozos: [], url: null, nombre: '' };

// ---------------------------------------------------------------------------
// Pintado
// ---------------------------------------------------------------------------

function pintarResultado(mensaje, tipo) {
  const caja = $('resultado');
  caja.textContent = mensaje;
  caja.className = `aviso ${tipo}`;
  caja.hidden = !mensaje;
}

function avisos(sesion, recuperada) {
  const lista = [];
  if (Object.hasOwn(FINES, sesion.motivoFin ?? '')) lista.push(texto(FINES[sesion.motivoFin]));
  if (recuperada) lista.push(texto(sesion.cortada ? 'vistaAvisoCortada' : 'vistaAvisoRecuperada'));
  const codigos = sesion.avisos ?? [];
  const o = sesion.original;
  if (codigos.includes('reducida') && o?.ancho && o?.alto && sesion.ancho && sesion.alto) {
    lista.push(texto('vistaAvisoReducida', resolucion(sesion.ancho, sesion.alto), resolucion(o.ancho, o.alto)));
  }
  if (codigos.includes('sin_audio')) lista.push(texto('vistaAvisoSinAudio'));
  return lista;
}

function pintarAvisos(lista) {
  $('avisos').replaceChildren(...lista.map((t) => {
    const li = document.createElement('li');
    li.className = 'aviso';
    li.textContent = t;
    return li;
  }));
}

// Un MP4 fragmentado puede no decir su duración (Infinity) hasta que se busca el final.
function duracionDelVideo(video) {
  if (Number.isFinite(video.duration) && video.duration > 0) return Promise.resolve(video.duration * 1000);
  return new Promise((resolver) => {
    const acabar = (ms) => {
      clearTimeout(reloj);
      video.removeEventListener('durationchange', alCambiar);
      video.currentTime = 0;
      resolver(ms);
    };
    const alCambiar = () => {
      if (Number.isFinite(video.duration) && video.duration > 0) acabar(video.duration * 1000);
    };
    const reloj = setTimeout(() => acabar(null), ESPERA_DURACION_MS);
    video.addEventListener('durationchange', alCambiar);
    video.currentTime = Number.MAX_SAFE_INTEGER;
  });
}

async function alCargarMetadatos() {
  const video = $('video');
  $('resolucion').textContent = resolucion(video.videoWidth, video.videoHeight);
  const ms = (await duracionDelVideo(video)) ?? vista.sesion.duracionMs;
  $('duracion').textContent = ms > 0 ? formatoTiempo(ms) : '—';
}

// El navegador no puede reproducirlo: se enseñan los datos guardados y se puede guardar igual.
function alFallarVideo() {
  if (!vista.url) return; // ya descartado: quitar el vídeo no es un fallo
  const { ancho, alto, duracionMs } = vista.sesion;
  $('resolucion').textContent = ancho && alto ? resolucion(ancho, alto) : '—';
  $('duracion').textContent = duracionMs > 0 ? formatoTiempo(duracionMs) : '—';
  $('video').hidden = true;
  pintarAvisos([...avisos(vista.sesion, vista.recuperada), texto('vistaErrorVideo')]);
}

function pintarSesion() {
  const { sesion, trozos } = vista;
  const video = $('video');
  vista.url = URL.createObjectURL(new Blob(trozos, { type: sesion.mime }));
  video.addEventListener('loadedmetadata', () => { alCargarMetadatos().catch((e) => console.error('Vista:', e)); }, { once: true });
  video.addEventListener('error', alFallarVideo, { once: true });
  video.src = vista.url;
  video.hidden = false;

  $('peso').textContent = formatoPeso(trozos.reduce((suma, t) => suma + t.size, 0));
  vista.nombre = nombreArchivo({
    superficie: sesion.superficie, tituloPestana: sesion.tituloPestana, fecha: new Date(sesion.creada ?? Date.now()),
  });
  $('nombre').textContent = vista.nombre;
  pintarAvisos(avisos(sesion, vista.recuperada));
  $('ficha').hidden = false;
}

function soltarVideo() {
  if (vista.url) URL.revokeObjectURL(vista.url);
  vista.url = null;
}

// Tras guardar o descartar ya no queda nada que hacer en la página.
function terminar(mensaje) {
  pintarResultado(mensaje, 'info');
  $('guardar').disabled = true;
  $('descartar').disabled = true;
  cerrarConfirmacion({ enfocar: false });
  $('resultado').focus(); // el botón pulsado ya no se puede usar: el foco no se pierde
}

// ---------------------------------------------------------------------------
// Guardar
// ---------------------------------------------------------------------------

async function escribir(archivo) {
  const escritor = await archivo.createWritable();
  try {
    for (const trozo of vista.trozos) await escritor.write(trozo); // uno a uno, sin un Blob enorme
    await escritor.close();
  } catch (e) {
    await escritor.abort().catch(() => {}); // no se deja un archivo a medias
    throw e;
  }
}

async function guardar() {
  $('guardar').disabled = true;
  $('descartar').disabled = true;
  pintarResultado('', 'info');
  let archivo;
  try {
    archivo = await window.showSaveFilePicker({
      suggestedName: vista.nombre,
      types: [{ description: texto('vistaTipoMp4'), accept: { 'video/mp4': ['.mp4'] } }],
    });
    await escribir(archivo);
  } catch (e) {
    $('guardar').disabled = false;
    $('descartar').disabled = false;
    if (e?.name === 'AbortError') return; // el usuario cerró el diálogo: todo sigue igual
    console.error('Vista: no se pudo guardar', e);
    pintarResultado(texto('vistaErrorGuardar', motivo(e)), 'error');
    return;
  }
  try {
    await almacen.actualizarSesion(vista.id, { estado: 'guardada' });
    await almacen.borrarSesion(vista.id);
  } catch (e) {
    // El archivo ya está guardado; lo que quede en el almacén lo borra la recuperación.
    console.error('Vista: no se pudo borrar la sesión guardada', e);
  }
  terminar(texto('vistaGuardado', archivo.name || vista.nombre));
}

// ---------------------------------------------------------------------------
// Descartar (con confirmación dentro de la página)
// ---------------------------------------------------------------------------

function abrirConfirmacion() {
  $('acciones').hidden = true;
  $('confirmar').hidden = false;
  $('volver').focus();
}

function cerrarConfirmacion({ enfocar = true } = {}) {
  $('confirmar').hidden = true;
  $('acciones').hidden = false;
  if (enfocar) $('descartar').focus();
}

async function descartar() {
  $('descartar-siempre').disabled = true;
  $('volver').disabled = true;
  try {
    await almacen.borrarSesion(vista.id);
  } catch (e) {
    console.error('Vista: no se pudo descartar', e);
    pintarResultado(texto('vistaErrorDescartar'), 'error');
    $('descartar-siempre').disabled = false;
    $('volver').disabled = false;
    return;
  }
  const video = $('video');
  video.pause();
  video.removeAttribute('src');
  video.load();
  video.hidden = true;
  soltarVideo();
  terminar(texto('vistaDescartada'));
}

// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------

async function cargar() {
  const consulta = new URLSearchParams(location.search);
  vista.id = consulta.get('sesion');
  vista.recuperada = consulta.get('recuperada') === '1';
  if (!vista.id) return false;
  vista.sesion = await almacen.leerSesion(vista.id);
  if (!vista.sesion) return false;
  vista.trozos = await almacen.leerTrozos(vista.id);
  return vista.trozos.length > 0;
}

// Una sola pestaña por grabación: la primera se queda el candado (hasta que se cierra)
// y la que llega después solo lo dice, sin Guardar ni Descartar. `trabajo` se ejecuta
// con el candado; devuelve false si ya lo tenía otra pestaña.
function conCandado(id, trabajo) {
  if (!navigator.locks) return trabajo().then(() => true); // sin Web Locks, sin la protección
  return new Promise((resolver, rechazar) => {
    navigator.locks.request(`vista:${id}`, { ifAvailable: true }, async (candado) => {
      if (!candado) { resolver(false); return; }
      try {
        await trabajo();
        resolver(true);
      } catch (e) {
        rechazar(e);
      }
      await new Promise(() => {}); // se suelta al cerrar la pestaña
    }).catch(rechazar);
  });
}

async function mostrar() {
  let hay = false;
  try {
    hay = await cargar();
  } catch (e) {
    console.error('Vista: no se pudo leer la grabación', e);
  }
  if (hay) pintarSesion();
  else pintarResultado(texto('vistaNoExiste'), 'info');
}

async function iniciar() {
  document.title = texto('vistaTituloPagina');
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = texto(el.dataset.i18n);

  $('guardar').addEventListener('click', () => { guardar().catch((e) => console.error('Vista:', e)); });
  $('descartar').addEventListener('click', abrirConfirmacion);
  $('volver').addEventListener('click', () => cerrarConfirmacion());
  $('descartar-siempre').addEventListener('click', () => { descartar().catch((e) => console.error('Vista:', e)); });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || $('confirmar').hidden) return;
    e.preventDefault();
    cerrarConfirmacion();
  });
  addEventListener('pagehide', soltarVideo);

  const id = new URLSearchParams(location.search).get('sesion');
  if (!id) await mostrar();
  else if (!(await conCandado(id, mostrar))) pintarResultado(texto('vistaYaAbierta'), 'info');
  $('app').dataset.listo = '1';
}

iniciar().catch((e) => console.error('Vista:', e));
