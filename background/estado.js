// Máquina de estados de la grabación. Módulo puro: sin chrome.* ni estado propio.

export const FASES = Object.freeze(['inactivo', 'eligiendo', 'cuenta_atras', 'grabando', 'en_pausa', 'cerrando']);

// {fase: {evento: nuevaFase}}; todo lo no listado no está permitido.
// 'terminado' desde grabando/en_pausa/cerrando = hay vídeo y se abre la vista previa;
// desde eligiendo/cuenta_atras = no hay vídeo.
const TABLA = Object.freeze({
  inactivo: Object.freeze({ iniciar: 'eligiendo' }),
  eligiendo: Object.freeze({ captura_lista: 'cuenta_atras', terminado: 'inactivo', cancelar: 'inactivo', error: 'inactivo' }),
  cuenta_atras: Object.freeze({ cuenta_fin: 'grabando', detener: 'inactivo', terminado: 'inactivo', cancelar: 'inactivo', error: 'inactivo' }),
  grabando: Object.freeze({ pausar: 'en_pausa', detener: 'cerrando', terminado: 'inactivo', error: 'cerrando' }),
  en_pausa: Object.freeze({ reanudar: 'grabando', detener: 'cerrando', terminado: 'inactivo', error: 'cerrando' }),
  // Un error al cerrar se anota y se sigue esperando a `terminado`, que trae lo grabado.
  cerrando: Object.freeze({ terminado: 'inactivo', error: 'cerrando' }),
});

const ATAJOS = Object.freeze({
  'alternar-grabacion': Object.freeze({
    inactivo: 'iniciar',
    eligiendo: 'cancelar',
    cuenta_atras: 'cancelar',
    grabando: 'detener',
    en_pausa: 'detener',
    cerrando: null,
  }),
  'alternar-pausa': Object.freeze({ grabando: 'pausar', en_pausa: 'reanudar' }),
});

const buscar = (tabla, clave) => (Object.hasOwn(tabla, clave) ? tabla[clave] : undefined);

// Devuelve la fase nueva, o null si el evento no está permitido en esa fase.
export function transicion(fase, evento) {
  const fila = buscar(TABLA, fase);
  if (!fila) return null;
  return buscar(fila, evento) ?? null;
}

// Evento que provoca un atajo de teclado en esa fase, o null si no hace nada.
export function accionAtajo(fase, comando) {
  const fila = buscar(ATAJOS, comando);
  if (!fila) return null;
  return buscar(fila, fase) ?? null;
}

export function estadoInicial() {
  return {
    fase: 'inactivo',
    sesionId: null,
    config: null,
    inicioMs: null,
    ms: 0,
    bytes: 0,
    ancho: null,
    alto: null,
    original: null,
    conAudio: false,
    superficie: null,
    tituloPestana: '',
    pestanaId: null,
    avisos: [],
    error: null,
  };
}
