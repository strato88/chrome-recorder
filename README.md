# Grabador MP4

Extensión de Chrome de uso interno de Dipesa. Graba una pestaña, una ventana o la pantalla completa a un archivo MP4 (vídeo H.264, audio AAC) con la resolución real de lo que se graba. Al parar, enseña una vista previa y tú decides dónde guardarlo con «Guardar como» o si lo descartas. Funciona en Windows y macOS, con Chrome 126 o posterior.

## Instalación

La extensión no está en la Chrome Web Store: se carga desde una carpeta de tu ordenador, la **carpeta de la extensión**.

1. Descarga la extensión desde GitHub: en la página del proyecto, pulsa el botón verde **Code** y luego **Download ZIP**.
   - Mientras este trabajo no se haya unido a la rama principal, el ZIP hay que bajarlo de la rama `claude/busy-keller-uoqzk7`: encima de la lista de archivos hay un botón con el nombre de la rama (normalmente «main»); púlsalo, elige `claude/busy-keller-uoqzk7` y después **Code** → **Download ZIP**.
2. Descomprime el ZIP. En Windows: clic derecho sobre el archivo → **Extraer todo**. No lo abras desde dentro del ZIP: Chrome necesita la carpeta descomprimida. En macOS basta con hacer doble clic.
3. Deja la carpeta descomprimida en un sitio estable (por ejemplo, en Documentos). Si la mueves o la borras, Chrome quita la extensión.
4. En Chrome, escribe `chrome://extensions` en la barra de direcciones.
5. Activa **Modo de desarrollador** (interruptor arriba a la derecha).
6. Pulsa **Cargar descomprimida** y elige la carpeta que contiene el archivo `manifest.json`. A veces, al descomprimir, queda una carpeta dentro de otra con el mismo nombre: elige la de dentro, la que tiene `manifest.json`.
7. Para tener el icono a mano, pulsa el icono de puzle de la barra de Chrome y, junto a «Grabador MP4», la chincheta.

La extensión se instala sin ningún aviso de permisos.

**Aviso al abrir Chrome.** Al abrir Chrome puede salir el aviso «Desactiva las extensiones en modo de desarrollador». Es normal con una extensión cargada así: ciérralo sin pulsar «Desactivar» para seguir usándola.

**Actualizar.** Descarga el ZIP nuevo, descomprímelo y sustituye con él el contenido de la carpeta de la extensión. Después, en `chrome://extensions`, pulsa el botón de recargar (la flecha circular) de la tarjeta «Grabador MP4».

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
   - Si pediste audio y Chrome no lo da para esa fuente en tu sistema, la grabación sigue sin sonido y te lo avisa: la pastilla enseña «Sin sonido».
   - Si en el disco no cabe una hora de grabación, te dice cuántos minutos caben (en la pastilla, «Espacio para … min»). Puedes grabar igualmente.
   - A los 55 minutos avisa de que quedan 5 («Quedan 5 min» en la pastilla); a los 60 minutos se para sola.
5. Para parar: **Detener**, el atajo, o el botón «Dejar de compartir» de Chrome. También se para si cierras la pestaña o la ventana que grabas.
6. Se abre una pestaña con la **vista previa**: el vídeo, su resolución, duración y peso, y el nombre propuesto (`Título_AAAA-MM-DD_HH-MM.mp4`; «Ventana» o «Pantalla» si no era una pestaña). Si grabaste otra pestaña distinta de la que tenías delante, el título no coincidirá: corrígelo al guardar.
   - **Guardar** abre «Guardar como» para elegir carpeta y nombre.
   - **Descartar** pide confirmación y borra la grabación sin posibilidad de recuperarla.
   
   Si la grabación se redujo de tamaño o salió sin sonido, la vista previa lo dice. También dice por qué acabó si no la paraste tú: porque se llegó a una hora, porque no quedaba espacio o porque algo falló (en los dos últimos casos tienes lo grabado hasta ese momento).

**Grabaciones sin guardar.** Lo grabado se va guardando en el disco mientras grabas, y sigue ahí hasta que lo guardes o lo descartes.
- Si cierras la vista previa sin querer, abre el popup: verás «Tienes 1 grabación sin guardar» y el botón **Abrir**, que vuelve a abrirla.
- Si Chrome se cierra o se cuelga a mitad, al volver a abrir Chrome aparece la vista previa como «Grabación recuperada» (puede faltarle el final).
- Cada grabación se abre en una sola pestaña. Si ya está abierta en otra, la nueva solo dice «Esta grabación ya está abierta en otra pestaña».

## Atajos

| Windows | Mac | Hace |
|---|---|---|
| `Alt+Mayús+R` | `Opción ⌥ + Mayús ⇧ + R` | Iniciar o detener la grabación (al iniciar usa la última configuración del popup) |
| `Alt+Mayús+P` | `Opción ⌥ + Mayús ⇧ + P` | Pausar o reanudar |

Solo funcionan con Chrome en primer plano. Con el selector de Chrome abierto, el atajo no hace nada (así una pulsación doble no cancela lo que acabas de pedir): para cancelar, usa el botón Cancelar del selector o la tecla Escape. Para cambiar los atajos, abre `chrome://extensions/shortcuts`.

## macOS

Chrome necesita permiso del sistema para ver la pantalla: en **Ajustes del Sistema → Privacidad y seguridad → Grabación de pantalla y audio del sistema**, activa Google Chrome y reinícialo cuando el sistema lo pida. Sin ese permiso (o si no has reiniciado Chrome después de darlo), Chrome no puede grabar ventanas ni la pantalla, y el popup te dice «Chrome no tiene permiso para grabar la pantalla» con estos mismos pasos.

El audio del sistema (al grabar una ventana o la pantalla) necesita macOS 14.2 o posterior y Chrome 141 o posterior. Con versiones anteriores solo se puede grabar audio de una pestaña.

## Limitaciones conocidas

- No funciona en Linux: Chrome no puede codificar el audio AAC allí. La extensión lo dice y no graba.
- El nombre propuesto usa el título de la pestaña que tenías delante al pulsar Grabar. Chrome no dice cuál elegiste en el selector, así que si grabas otra, cambia el nombre al guardar.
- La pastilla solo aparece en la pestaña que estaba delante al pulsar Grabar, y desaparece si esa pestaña pasa a otro sitio web. No sale en páginas internas de Chrome (`chrome://…`) ni en la tienda de extensiones; en ese caso sigues teniendo el icono y el popup.
- La barra «Se está compartiendo…» de Chrome no se puede ocultar.
- La resolución máxima es 4096×2304. Si tu pantalla es mayor (por ejemplo 5K), se graba reducida y la vista previa lo avisa. Este límite se revisará cuando se confirme en equipos reales si el sistema admite más.
- Una grabación dura como máximo 1 hora.
- Para guardar una grabación muy larga hace falta en el disco unas dos veces lo que pesa: Chrome escribe primero una copia temporal (`.crswap`) y la renombra al acabar.
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
