// Icono de la barra de herramientas según la fase de la grabación (puro).
const TAMANOS = Object.freeze([16, 32, 48, 128]);
const FASES_GRABANDO = Object.freeze(['cuenta_atras', 'grabando', 'en_pausa']);

export function iconosDeFase(fase) {
  const tipo = FASES_GRABANDO.includes(fase) ? 'grabando' : 'reposo';
  return Object.fromEntries(TAMANOS.map((t) => [t, `iconos/${tipo}-${t}.png`]));
}
