# Grabador MP4

Extensión de Chrome de uso interno de Dipesa. Graba una pestaña, una ventana o la pantalla completa a un archivo MP4 (vídeo H.264, audio AAC) con la resolución real de lo que se graba. Al parar, enseña una vista previa y tú decides dónde guardarlo con «Guardar como» o si lo descartas. Funciona en Windows y macOS, con Chrome 126 o posterior.

## Instalación

La extensión no está en la Chrome Web Store: se carga desde la carpeta del repositorio.

1. Descarga o clona este repositorio y deja la carpeta en un sitio estable (si la mueves o la borras, Chrome la desinstala).
2. En Chrome, escribe `chrome://extensions` en la barra de direcciones.
3. Activa **Modo de desarrollador** (interruptor arriba a la derecha).
4. Pulsa **Cargar descomprimida** y elige la carpeta del repositorio (la que contiene `manifest.json`).
5. Para tener el icono a mano, pulsa el icono de puzle de la barra de Chrome y, junto a «Grabador MP4», la chincheta.

La extensión se instala sin ningún aviso de permisos.

**Actualizar.** Después de traer cambios nuevos del repositorio, vuelve a `chrome://extensions` y pulsa el botón de recargar (la flecha circular) de la tarjeta «Grabador MP4».

## Cómo se usa

1. Pulsa el icono de la extensión. Elige:
   - **Fuente**: Pestaña, Ventana o Pantalla. Es solo la opción que Chrome te propone primero; lo que se graba lo eliges en el paso siguiente.
   - **Audio**: Sin audio, o Pestaña o sistema.
   - **Calidad**: Normal, Alta o Máxima. Más calidad, archivos más grandes.
   - **Fotogramas**: 30 o 60 por segundo.
   
   Debajo de «Grabar» verás un cálculo aproximado de lo que pesa cada minuto.
2. Pulsa **Grabar**. Chrome abre su propio selector: elige la pestaña, la ventana o la pantalla que quieres grabar. Si quieres audio y el selector tiene la casilla de compartir audio, márcala. Si cancelas el selector, no se graba nada.
3. Una cuenta atrás de 3 segundos (número grande en la página y en el icono). Puedes cancelarla desde el popup.
4. Mientras graba:
   - El icono de la extensión muestra el tiempo en rojo. En pausa muestra «II» en ámbar.
   - En la pestaña que tenías delante al pulsar Grabar aparece una pastilla flotante con el tiempo, Pausa, Detener y Ocultar. Se puede arrastrar. Si esa pestaña se ve en lo que grabas, la pastilla sale en el vídeo; pulsa **Ocultar** para quitarla (se queda oculta hasta que acabe esa grabación).
   - Desde el popup también ves tiempo, peso y resolución real, y tienes **Pausa** (luego **Reanudar**) y **Detener**.
   - Si pediste audio y Chrome no lo da para esa fuente en tu sistema, la grabación sigue sin sonido y te lo avisa.
   - A los 55 minutos avisa de que quedan 5; a los 60 minutos se para sola.
5. Para parar: **Detener**, el atajo, o el botón «Dejar de compartir» de Chrome. También se para si cierras la pestaña o la ventana que grabas.
6. Se abre una pestaña con la **vista previa**: el vídeo, su resolución, duración y peso, y el nombre propuesto (`Título_AAAA-MM-DD_HH-MM.mp4`; «Ventana» o «Pantalla» si no era una pestaña). Si grabaste otra pestaña distinta de la que tenías delante, el título no coincidirá: corrígelo al guardar.
   - **Guardar** abre «Guardar como» para elegir carpeta y nombre.
   - **Descartar** pide confirmación y borra la grabación sin posibilidad de recuperarla.
   
   Si la grabación se redujo de tamaño o salió sin sonido, la vista previa lo dice.

**Grabaciones recuperadas.** Lo grabado se va guardando en el disco mientras grabas. Si Chrome se cierra o se cuelga a mitad, al volver a abrir Chrome aparece la vista previa como «Grabación recuperada» (puede faltarle el final). Se guarda o se descarta como cualquier otra. Mientras no hagas una de las dos cosas, la grabación sigue ahí.

## Atajos

| Atajo | Hace |
|---|---|
| `Alt+Mayús+R` | Iniciar o detener la grabación (al iniciar usa la última configuración del popup) |
| `Alt+Mayús+P` | Pausar o reanudar |

Solo funcionan con Chrome en primer plano. Para cambiarlos, abre `chrome://extensions/shortcuts`.

## macOS

Chrome necesita permiso del sistema para ver la pantalla: en **Ajustes del Sistema → Privacidad y seguridad → Grabación de pantalla y audio del sistema**, activa Google Chrome y reinícialo cuando el sistema lo pida. Sin ese permiso, Chrome no puede grabar ventanas ni la pantalla.

El audio del sistema (al grabar una ventana o la pantalla) necesita macOS 14.2 o posterior y Chrome 141 o posterior. Con versiones anteriores solo se puede grabar audio de una pestaña.

## Limitaciones conocidas

- No funciona en Linux: Chrome no puede codificar el audio AAC allí. La extensión lo dice y no graba.
- El nombre propuesto usa el título de la pestaña que tenías delante al pulsar Grabar. Chrome no dice cuál elegiste en el selector, así que si grabas otra, cambia el nombre al guardar.
- La pastilla flotante aparece en el vídeo si esa pestaña está a la vista en lo que grabas. Usa Ocultar.
- La pastilla solo aparece en la pestaña que estaba delante al pulsar Grabar, y desaparece si esa pestaña pasa a otro sitio web. No sale en páginas internas de Chrome (`chrome://…`) ni en la tienda de extensiones; en ese caso sigues teniendo el icono y el popup.
- La barra «Se está compartiendo…» de Chrome no se puede ocultar.
- La resolución máxima es 4096×2304. Si tu pantalla es mayor (por ejemplo 5K), se graba reducida y la vista previa lo avisa. Este límite se revisará cuando se confirme en equipos reales si el sistema admite más.
- Una grabación dura como máximo 1 hora.
- Si paras en el primer instante, puede salir el mensaje «La grabación ha sido demasiado corta: no se ha guardado nada».
- Cada grabación pesa en el disco; con calidad Normal, 30 fotogramas y pantalla de 1440p, unos 3,5 GB por hora. Si no queda espacio, la grabación se para y conserva lo grabado hasta ahí.
- Solo se puede grabar una cosa a la vez. Sin micrófono ni mezcla de audios.

## Para desarrolladores

Sin dependencias ni paso de compilación: se carga tal cual.

```
npm test                  # pruebas unitarias (Node, sin Chrome)
npm run test:integracion  # integración: Chrome for Testing + Xvfb + ffprobe
```

`test:integracion` necesita `xvfb-run`, `ffprobe` (de ffmpeg) y Playwright con Chrome for Testing, que el repositorio no instala (debe resolverse con `require('playwright')`); tarda unos minutos. En Linux no hay AAC, así que las pruebas fuerzan Opus con `modoPrueba` (solo lo pone el arnés).

Documentos:

- `docs/especificacion.md`: especificación vigente (v2).
- `docs/fase1-diagnostico.md`: diagnóstico técnico de la Fase 1.
- `docs/fase3-checklist.md`: comprobaciones manuales en Windows y macOS.
- `docs/superpowers/plans/2026-11-01-grabador-mp4.md`: plan de implementación.
