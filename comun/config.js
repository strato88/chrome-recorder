// Constantes y configuración por defecto. Módulo puro: lo usan Node y la extensión.

// fuente ∈ 'browser' | 'window' | 'monitor'
export const CONFIG_DEFECTO = Object.freeze({ fuente: 'browser', audio: true, calidad: 'normal', fps: 30 });

export const TIMESLICE_MS = 2000;
export const CUENTA_S = 3;
export const AVISO_MS = 3300000; // aviso a los 55 min
export const MAX_MS = 3600000; // parada a los 60 min
export const VIGILANTE_MS = 5000;
export const REINTENTO_ANCHO = 1920;
