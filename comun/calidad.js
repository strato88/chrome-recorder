// Cálculos de calidad, tope de resolución y formatos. Módulo puro.
import { REINTENTO_ANCHO } from './config.js';

export const FACTORES = Object.freeze({ normal: 0.07, alta: 0.10, maxima: 0.15 });
export const AUDIO_BPS = 128000;
export const MAX_PIXELES = 36864 * 256; // 9 437 184

// Lado par más cercano por debajo (con una pizca de tolerancia para el error de coma flotante).
const parAbajo = (x) => Math.floor(x / 2 + 1e-9) * 2;

export function bitrateVideo(ancho, alto, fps, nivel) {
  const factor = FACTORES[nivel];
  if (factor === undefined) throw new RangeError(`Nivel de calidad desconocido: ${nivel}`);
  return Math.round(ancho * alto * fps * factor);
}

export function tamanoConTope(ancho, alto) {
  if (ancho * alto <= MAX_PIXELES) return { ancho, alto, reducido: false };
  const s = Math.sqrt(MAX_PIXELES / (ancho * alto));
  let a = parAbajo(ancho * s);
  let b = parAbajo(alto * s);
  while (a * b > MAX_PIXELES) {
    if (a >= b) a -= 2;
    else b -= 2;
  }
  return { ancho: a, alto: b, reducido: true };
}

export function tamanoReintento(ancho, alto) {
  if (ancho <= REINTENTO_ANCHO) return { ancho: parAbajo(ancho), alto: parAbajo(alto) };
  return { ancho: REINTENTO_ANCHO, alto: parAbajo(alto * REINTENTO_ANCHO / ancho) };
}

export function bytesPorMinuto(ancho, alto, fps, nivel, conAudio) {
  const bps = bitrateVideo(ancho, alto, fps, nivel) + (conAudio ? AUDIO_BPS : 0);
  return Math.round(bps * 60 / 8);
}

// Minutos enteros de grabación que caben en `libre` bytes a `bytesMinuto` por minuto.
export function minutosQueCaben(libre, bytesMinuto) {
  if (!(bytesMinuto > 0)) return Infinity;
  return Math.max(0, Math.floor(Math.max(0, libre) / bytesMinuto));
}

export function formatoTiempo(ms) {
  const total = Math.floor(Math.max(0, ms) / 1000);
  const mm = String(Math.floor(total / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

// Unidades decimales (1e6 / 1e9), no 1024. Coma decimal.
export function formatoPeso(bytes) {
  const mb = Math.round(bytes / 1e6);
  if (mb === 0 && bytes > 0) return '<1 MB'; // algo hay: «0 MB» parecería vacío
  if (mb < 1000) return `${mb} MB`;
  return `${(bytes / 1e9).toFixed(1).replace('.', ',')} GB`;
}
