// Nombre de archivo de la grabación. Módulo puro.

const MAX_TITULO = 80;
const recortar = (s) => s.replace(/^[-.]+|[-.]+$/g, '');

export function limpiarTitulo(texto) {
  const limpio = String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 ._-]/g, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-');
  return recortar(recortar(limpio).slice(0, MAX_TITULO));
}

const dos = (n) => String(n).padStart(2, '0');

// superficie ∈ 'browser' | 'window' | 'monitor'; fecha: Date en hora local
export function nombreArchivo({ superficie, tituloPestana, fecha }) {
  let base;
  if (superficie === 'window') base = 'Ventana';
  else if (superficie === 'monitor') base = 'Pantalla';
  else base = limpiarTitulo(tituloPestana) || 'Grabacion';
  const dia = `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())}`;
  const hora = `${dos(fecha.getHours())}-${dos(fecha.getMinutes())}`;
  return `${base}_${dia}_${hora}.mp4`;
}
