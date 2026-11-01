// Superposición en la pestaña que estaba activa al pulsar Grabar. Nunca debe
// romper ni frenar una grabación: todo lo que va hacia la pestaña se captura y se
// ignora (pestaña cerrada, chrome://, tienda, navegación a medias).
const FICHERO = 'superposicion/superposicion.js';

const pestanaDe = (estado) => (Number.isInteger(estado?.pestanaId) ? estado.pestanaId : null);

// Inyecta el script (si ya estaba, no duplica nada). Devuelve true si se inyectó.
export async function inyectar(estado) {
  const tabId = pestanaDe(estado);
  if (tabId === null) return false;
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: [FICHERO] });
    return true;
  } catch {
    return false;
  }
}

// Avisa a la pestaña del estado actual. No espera: no debe frenar la cola del orquestador.
export function avisar(estado) {
  const tabId = pestanaDe(estado);
  if (tabId === null) return;
  try {
    chrome.tabs.sendMessage(tabId, { destino: 'superposicion', estado }).catch(() => {});
  } catch { /* pestaña inválida */ }
}
