// Almacén en IndexedDB: sesiones de grabación y sus trozos.
// Una única conexión perezosa; cada operación va en su propia transacción.

const NOMBRE_BD = 'grabador';
const VERSION_BD = 1;
const SESIONES = 'sesiones';
const TROZOS = 'trozos';

let conexion = null;

function abrir() {
  if (!conexion) {
    conexion = new Promise((resolver, rechazar) => {
      const peticion = indexedDB.open(NOMBRE_BD, VERSION_BD);
      peticion.onupgradeneeded = () => {
        const bd = peticion.result;
        bd.createObjectStore(SESIONES, { keyPath: 'id' });
        bd.createObjectStore(TROZOS, { keyPath: ['sesion', 'n'] });
      };
      peticion.onsuccess = () => {
        const bd = peticion.result;
        // Si otra pestaña pide actualizar o la conexión se pierde, la próxima
        // operación vuelve a abrirla.
        bd.onversionchange = () => { bd.close(); conexion = null; };
        bd.onclose = () => { conexion = null; };
        resolver(bd);
      };
      peticion.onerror = () => { conexion = null; rechazar(peticion.error); };
      peticion.onblocked = () => { conexion = null; rechazar(new Error('Base de datos bloqueada')); };
    });
  }
  return conexion;
}

// Ejecuta `trabajo(almacenes)` en una transacción y resuelve con su resultado
// cuando la transacción se confirma.
async function transaccion(nombres, modo, trabajo) {
  const bd = await abrir();
  return new Promise((resolver, rechazar) => {
    const tx = bd.transaction(nombres, modo);
    let resultado;
    tx.oncomplete = () => resolver(resultado);
    // Sin `onerror`: cuando salta, `tx.error` aún es null. Al abortarse la
    // transacción (también por un error de petición) `tx.error` ya trae el motivo.
    tx.onabort = () => rechazar(tx.error || new Error('Transacción abortada'));
    try {
      resultado = trabajo(Object.fromEntries(nombres.map((n) => [n, tx.objectStore(n)])), tx);
    } catch (e) {
      tx.abort();
      rechazar(e);
    }
  });
}

// Convierte una petición en promesa para encadenar lecturas dentro de la misma transacción.
function pedir(peticion) {
  return new Promise((resolver, rechazar) => {
    peticion.onsuccess = () => resolver(peticion.result);
    peticion.onerror = () => rechazar(peticion.error);
  });
}

export function crearSesion(datos) {
  return transaccion([SESIONES], 'readwrite', (a) => { a[SESIONES].put(datos); });
}

export function actualizarSesion(id, cambios) {
  return transaccion([SESIONES], 'readwrite', (a) => {
    const lectura = a[SESIONES].get(id);
    lectura.onsuccess = () => {
      if (lectura.result) a[SESIONES].put({ ...lectura.result, ...cambios });
    };
  });
}

export async function leerSesion(id) {
  const bd = await abrir();
  return pedir(bd.transaction(SESIONES).objectStore(SESIONES).get(id));
}

export async function listarSesiones() {
  const bd = await abrir();
  return pedir(bd.transaction(SESIONES).objectStore(SESIONES).getAll());
}

export function anadirTrozo(sesion, n, blob) {
  return transaccion([TROZOS], 'readwrite', (a) => { a[TROZOS].put({ sesion, n, blob }); });
}

export async function leerTrozos(sesion) {
  const bd = await abrir();
  const rango = IDBKeyRange.bound([sesion, 0], [sesion, Infinity]);
  const filas = await pedir(bd.transaction(TROZOS).objectStore(TROZOS).getAll(rango));
  return filas.map((f) => f.blob);
}

export function borrarSesion(id) {
  return transaccion([SESIONES, TROZOS], 'readwrite', (a) => {
    a[SESIONES].delete(id);
    a[TROZOS].delete(IDBKeyRange.bound([id, 0], [id, Infinity]));
  });
}

export async function espacio() {
  const { quota = 0, usage = 0 } = await navigator.storage.estimate();
  return { libre: quota - usage, cuota: quota };
}
