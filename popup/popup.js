// Popup: configurar y lanzar la grabación; mientras graba, tiempo, peso y controles.
// Solo lee el estado de chrome.storage.session (y escucha onChanged): no registra
// escucha de mensajes, porque el orquestador y la grabadora emiten mensajes a todos.
import { CONFIG_DEFECTO } from '../comun/config.js';
import { bytesPorMinuto, tamanoConTope, formatoTiempo, formatoPeso } from '../comun/calidad.js';
import { enviar, AL_ORQUESTADOR, ERRORES, AVISOS } from '../comun/mensajes.js';

const FUENTES = ['browser', 'window', 'monitor'];
const CALIDADES = ['normal', 'alta', 'maxima'];
const FPS = [30, 60];

const $ = (id) => document.getElementById(id);
const texto = (clave, ...sustituciones) => chrome.i18n.getMessage(clave, sustituciones.map(String));
// 'quedan_5_min' → 'Quedan5Min' (las claves de messages.json van en camelCase).
const camel = (codigo) => codigo.split('_').map((p) => p[0].toUpperCase() + p.slice(1)).join('');

// Pantalla: mensajes que ve cada fase.
const GRUPO = {
  inactivo: 'parado',
  eligiendo: 'espera',
  cuenta_atras: 'espera',
  grabando: 'activo',
  en_pausa: 'activo',
  cerrando: 'activo',
};

const vista = { grupo: null, fase: null, estado: null, cuenta: null, pendientes: [] };

// ---------------------------------------------------------------------------
// Configuración
// ---------------------------------------------------------------------------

function normalizarConfig(c) {
  const d = CONFIG_DEFECTO;
  return {
    fuente: FUENTES.includes(c?.fuente) ? c.fuente : d.fuente,
    audio: typeof c?.audio === 'boolean' ? c.audio : d.audio,
    calidad: CALIDADES.includes(c?.calidad) ? c.calidad : d.calidad,
    fps: FPS.includes(c?.fps) ? c.fps : d.fps,
  };
}

function leerFormulario() {
  return normalizarConfig({
    fuente: $('fuente').value,
    audio: $('audio').value === 'si',
    calidad: $('calidad').value,
    fps: Number($('fps').value),
  });
}

function pintarFormulario(config) {
  $('fuente').value = config.fuente;
  $('audio').value = config.audio ? 'si' : 'no';
  $('calidad').value = config.calidad;
  $('fps').value = String(config.fps);
}

// Con la pantalla en píxeles físicos y el mismo tope que aplicará la grabadora (§4.1).
function pintarEstimacion() {
  const { calidad, fps, audio } = leerFormulario();
  const { ancho, alto } = tamanoConTope(Math.round(screen.width * devicePixelRatio), Math.round(screen.height * devicePixelRatio));
  const peso = formatoPeso(bytesPorMinuto(ancho, alto, fps, calidad, audio));
  $('estimacion').textContent = texto('popupEstimacion', peso, `${ancho}×${alto}`);
}

async function alCambiarFormulario() {
  pintarEstimacion();
  try {
    await chrome.storage.local.set({ config: leerFormulario() });
  } catch (e) {
    console.warn('Popup: no se pudo guardar la configuración', e);
  }
}

// ---------------------------------------------------------------------------
// Pintado según el estado
// ---------------------------------------------------------------------------

function pintarMensaje(estado) {
  const codigo = estado.fase === 'inactivo' ? estado.error?.codigo : null;
  const caja = $('mensaje');
  if (!codigo) { caja.hidden = true; caja.textContent = ''; return; }
  const clave = `error${camel(ERRORES.includes(codigo) ? codigo : 'grabadora')}`;
  caja.textContent = texto(clave);
  caja.classList.toggle('error', codigo !== 'cancelado');
  caja.classList.toggle('info', codigo === 'cancelado');
  caja.hidden = false;
}

const resolucion = (ancho, alto) => `${ancho}×${alto}`;

// Texto de un aviso. «reducida» lleva las dos resoluciones (null si no se conocen) y
// «poco_espacio», los minutos que caben.
function textoAviso(codigo, estado) {
  if (codigo === 'reducida') {
    const o = estado.original;
    if (!(o && estado.ancho && estado.alto)) return null;
    return texto('avisoReducida', resolucion(estado.ancho, estado.alto), resolucion(o.ancho, o.alto));
  }
  if (codigo === 'poco_espacio') {
    const min = estado.minutosEspacio;
    return Number.isInteger(min) && min > 0 ? texto('avisoPocoEspacio', min) : texto('avisoPocoEspacioNada');
  }
  return texto(`aviso${camel(codigo)}`);
}

function pintarActivo(estado) {
  const enPausa = estado.fase === 'en_pausa';
  const cerrando = estado.fase === 'cerrando';
  $('estado-texto').textContent = texto(cerrando ? 'popupCerrando' : enPausa ? 'popupEnPausa' : 'popupGrabando');
  $('punto').classList.toggle('pausa', enPausa);
  $('tiempo').textContent = formatoTiempo(estado.ms);

  const datos = $('datos');
  datos.replaceChildren();
  const fila = (etiqueta, valor) => {
    const dt = document.createElement('dt');
    dt.textContent = etiqueta;
    const dd = document.createElement('dd');
    dd.textContent = valor;
    datos.append(dt, dd);
  };
  fila(texto('popupPeso'), formatoPeso(estado.bytes));
  if (estado.ancho && estado.alto) {
    fila(texto('popupResolucion'), resolucion(estado.ancho, estado.alto));
  }

  // Un aviso por código.
  const lista = $('avisos');
  lista.replaceChildren();
  for (const codigo of estado.avisos ?? []) {
    const t = AVISOS.includes(codigo) ? textoAviso(codigo, estado) : null;
    if (!t) continue;
    const li = document.createElement('li');
    li.className = 'aviso';
    li.textContent = t;
    lista.append(li);
  }

  $('pausar').textContent = texto(enPausa ? 'popupReanudar' : 'popupPausa');
  $('detener').textContent = texto('popupDetener');
  for (const id of ['pausar', 'detener']) {
    $(id).disabled = cerrando;
    $(id).hidden = false;
  }
}

function pintarEspera(estado) {
  const cuenta = estado.fase === 'cuenta_atras';
  $('texto-espera').textContent = texto(cuenta ? 'popupCuentaAtras' : 'popupElegir');
  const numero = $('numero');
  numero.hidden = !cuenta;
  if (cuenta) {
    numero.textContent = String(Math.max(1, Math.ceil(((estado.cuentaFinMs ?? Date.now()) - Date.now()) / 1000)));
  }
  $('cancelar').textContent = texto('popupCancelar');
  $('cancelar').disabled = false;
}

// Grabaciones sin guardar (p. ej. se cerró la vista previa sin querer): solo en reposo.
function pintarPendientes() {
  const n = vista.estado?.fase === 'inactivo' ? vista.pendientes.length : 0;
  $('pendientes').hidden = n === 0;
  if (n > 0) $('pendientes-texto').textContent = n === 1 ? texto('popupPendienteUna') : texto('popupPendientes', n);
}

async function buscarPendientes() {
  try {
    const ids = await enviar(AL_ORQUESTADOR.pendientes);
    vista.pendientes = Array.isArray(ids) ? ids : [];
  } catch (e) {
    console.warn('Popup: no se pudieron buscar las grabaciones sin guardar', e);
    vista.pendientes = [];
  }
  pintarPendientes();
}

// Lo que se anuncia (una vez) al cambiar de fase; el tiempo no se anuncia cada segundo.
const ANUNCIO = {
  eligiendo: 'popupElegir', cuenta_atras: 'popupCuentaAtras', grabando: 'popupGrabando',
  en_pausa: 'popupEnPausa', cerrando: 'popupCerrando',
};

function anunciarFase(estado) {
  if (vista.fase === null || vista.fase === estado.fase) return;
  $('anuncio').textContent = Object.hasOwn(ANUNCIO, estado.fase) ? texto(ANUNCIO[estado.fase]) : '';
}

function pintar(estado) {
  anunciarFase(estado);
  const faseAnterior = vista.fase;
  vista.estado = estado;
  vista.fase = estado.fase;
  const grupo = GRUPO[estado.fase] ?? 'parado';
  const cambioDeGrupo = vista.grupo !== null && vista.grupo !== grupo;

  pintarMensaje(estado);
  for (const id of ['parado', 'activo', 'espera']) $(id).hidden = id !== grupo;
  if (grupo === 'activo') pintarActivo(estado);
  if (grupo === 'espera') pintarEspera(estado);
  if (grupo === 'parado') $('grabar').disabled = false;
  vista.grupo = grupo;
  pintarPendientes();
  // De vuelta en reposo (p. ej. tras grabar) puede haber otra pendiente: se vuelve a mirar.
  if (estado.fase === 'inactivo' && faseAnterior !== null && faseAnterior !== 'inactivo') buscarPendientes();

  // La cuenta atrás cambia sola cada segundo, sin que cambie el estado guardado.
  clearInterval(vista.cuenta);
  vista.cuenta = estado.fase === 'cuenta_atras' ? setInterval(() => pintarEspera(vista.estado), 250) : null;

  // Si el control que tenía el foco ha desaparecido, el foco pasa al principal de la nueva pantalla.
  if (cambioDeGrupo) {
    const principal = { parado: 'grabar', activo: 'pausar', espera: 'cancelar' }[grupo];
    $(principal).focus();
  }
}

// ---------------------------------------------------------------------------
// Acciones
// ---------------------------------------------------------------------------

async function grabar() {
  const boton = $('grabar');
  boton.disabled = true; // un segundo clic no lanza otra grabación
  try {
    const [pestana] = await chrome.tabs.query({ active: true, currentWindow: true });
    await enviar(AL_ORQUESTADOR.iniciar, {
      config: leerFormulario(),
      tituloPestana: pestana?.title || '',
      pestanaId: pestana?.id ?? null,
    });
    window.close();
  } catch (e) {
    console.error('Popup: no se pudo iniciar la grabación', e);
    boton.disabled = false;
  }
}

// Abre las vistas previas de las grabaciones sin guardar (el orquestador las abre).
async function abrirPendientes() {
  $('abrir-pendientes').disabled = true;
  try {
    await enviar(AL_ORQUESTADOR.abrir_pendientes);
    vista.pendientes = [];
    pintarPendientes();
  } catch (e) {
    console.error('Popup: no se pudieron abrir las grabaciones sin guardar', e);
  }
  $('abrir-pendientes').disabled = false;
}

// Pausa, Detener y Cancelar: se desactivan hasta que llegue el estado nuevo.
async function orden(tipo, id) {
  $(id).disabled = true;
  try {
    await enviar(tipo);
  } catch (e) {
    console.error(`Popup: no se pudo enviar «${tipo}»`, e);
  }
  if (vista.estado) pintar(vista.estado); // si el estado no cambió, vuelve a habilitar
}

// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------

async function leerEstado() {
  const { estado } = await chrome.storage.session.get('estado');
  return estado ?? { fase: 'inactivo', avisos: [], error: null, ms: 0, bytes: 0 };
}

async function iniciar() {
  document.title = texto('popupTitulo');
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = texto(el.dataset.i18n);

  const { config } = await chrome.storage.local.get('config');
  pintarFormulario(normalizarConfig(config));
  pintarEstimacion();

  for (const id of ['fuente', 'audio', 'calidad', 'fps']) $(id).addEventListener('change', alCambiarFormulario);
  $('grabar').addEventListener('click', grabar);
  $('pausar').addEventListener('click', () => orden(vista.estado?.fase === 'en_pausa' ? 'reanudar' : 'pausar', 'pausar'));
  $('detener').addEventListener('click', () => orden('detener', 'detener'));
  $('cancelar').addEventListener('click', () => orden('cancelar', 'cancelar'));
  $('abrir-pendientes').addEventListener('click', abrirPendientes);

  chrome.storage.onChanged.addListener((cambios, area) => {
    if (area === 'session' && cambios.estado) pintar(cambios.estado.newValue ?? { fase: 'inactivo', avisos: [], error: null, ms: 0, bytes: 0 });
  });
  const estado = await leerEstado();
  pintar(estado);
  // Si la grabadora murió sin avisar, la fase se quedaría colgada (p. ej. en «Guardando…»
  // con todo desactivado): se pide al orquestador que lo mire. No se espera la respuesta;
  // el estado nuevo llega, como siempre, por chrome.storage.
  if (estado.fase !== 'inactivo') enviar(AL_ORQUESTADOR.revisar).catch(() => {});
  else await buscarPendientes();
  $('app').dataset.listo = '1';
}

iniciar().catch((e) => console.error('Popup:', e));
