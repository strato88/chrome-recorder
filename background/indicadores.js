// Icono e insignia de la barra de herramientas según la fase de la grabación (puro).
import { formatoTiempo } from '../comun/calidad.js';

const TAMANOS = Object.freeze([16, 32, 48, 128]);
const FASES_GRABANDO = Object.freeze(['cuenta_atras', 'grabando', 'en_pausa']);

export function iconosDeFase(fase) {
  const tipo = FASES_GRABANDO.includes(fase) ? 'grabando' : 'reposo';
  return Object.fromEntries(TAMANOS.map((t) => [t, `iconos/${tipo}-${t}.png`]));
}

export const COLOR_INSIGNIA = Object.freeze({ grabando: '#C8302B', en_pausa: '#8A5A00', cuenta_atras: '#2E86AB' });

export function textoInsignia(estado, ahora = Date.now()) {
  switch (estado.fase) {
    case 'grabando': return formatoTiempo(estado.ms);
    case 'en_pausa': return 'II';
    case 'cuenta_atras': return String(Math.max(1, Math.ceil(((estado.cuentaFinMs ?? ahora) - ahora) / 1000)));
    default: return '';
  }
}
