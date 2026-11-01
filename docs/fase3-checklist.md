# Fase 3: checklist en Windows y macOS

Comprobaciones manuales con una persona delante, en un Windows y un Mac reales, con Chrome 126 o posterior. Origen: `docs/especificacion.md` §7 y §8.

Marca cada casilla con `x` al comprobarla; anota entre paréntesis lo que haya de raro (por ejemplo `x (avisa de reducida)`). Si una casilla falla, no sigas con la siguiente fila sin apuntar el motivo y mira «Qué hacer si falla» más abajo.

## Antes de empezar

1. Carga la extensión en `chrome://extensions` como dice el README (ZIP de `main` → descomprimir → Modo de desarrollador → Cargar descomprimida → la carpeta que contiene `manifest.json`). Comprueba que no sale ningún aviso de permisos al instalar.
2. En macOS, da a Chrome el permiso «Grabación de pantalla y audio del sistema» (Ajustes del Sistema → Privacidad y seguridad) y reinicia Chrome.
3. Ten a mano `ffprobe` (viene con ffmpeg) y VLC. Se usa también QuickTime (macOS) y el reproductor de Windows («Películas y TV» o «Reproductor multimedia»).
4. Anota el sistema, versión y versión de Chrome (`chrome://version`):

| Sistema | Versión | Chrome | Fecha | Quién |
|---|---|---|---|---|
| Windows | | | | |
| macOS | | | | |

## Cómo conocer la resolución física de la pantalla

- **Windows:** Configuración → Sistema → Pantalla → «Resolución de pantalla». Es la recomendada o la elegida, por ejemplo 2560 × 1440. Con varios monitores, mira la del monitor que grabas. Si la escala es distinta de 100 %, la grabación debe coincidir igualmente con la resolución de pantalla, no con la «escalada».
- **macOS:** menú Apple → Acerca de este Mac → Más información → Información del sistema → Gráficos/Pantallas, línea «Resolución». En una pantalla Retina esa línea da los píxeles físicos (por ejemplo 3024 × 1964); la opción «Parece de…» de Ajustes → Pantallas es el tamaño aparente, que no vale. La grabación de una pantalla debe salir con los píxeles físicos.
- **Una ventana o una pestaña** no tienen resolución de pantalla: el vídeo debe coincidir con el tamaño en píxeles reales de esa ventana o pestaña. En la vista previa, «Resolución» lo dice.

## Cómo medir cada archivo

Guarda el MP4 desde la vista previa y ejecuta:

```
ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,profile,width,height,r_frame_rate -show_entries format=duration -of default=nw=1 archivo.mp4
```

Debe salir `codec_name=h264`, `width` y `height` iguales a la resolución física (o a la de la ventana o pestaña), `r_frame_rate` cerca de 30/1 (o 60/1 si elegiste 60) y una `duration` parecida a lo grabado.

Para ver si hay audio y de qué tipo:

```
ffprobe -v error -select_streams a -show_entries stream=codec_name,sample_rate,channels -of default=nw=1 archivo.mp4
```

Con audio debe salir `codec_name=aac`. Sin audio no debe salir ninguna línea.

## Matriz de grabaciones

Para cada fila graba unos 15 segundos con calidad Normal y 30 fotogramas. En las filas con audio, pon música o un vídeo con sonido en lo que grabas. «Se graba» = se llega a la vista previa con vídeo; «Resolución = física» = lo que dice `ffprobe` coincide con lo que debe ser; «Audio» = suena en el archivo guardado y `ffprobe` da `aac`. En las filas sin audio, «Audio» se marca si no hay pista.

### Windows

| Fuente | Audio | Se graba | Resolución = física | Audio | Abre en VLC | Abre en el reproductor de Windows | Notas |
|---|---|---|---|---|---|---|---|
| Pestaña | Sin audio | [ ] | [ ] | [ ] | [ ] | [ ] | |
| Pestaña | Pestaña o sistema | [ ] | [ ] | [ ] | [ ] | [ ] | |
| Ventana | Sin audio | [ ] | [ ] | [ ] | [ ] | [ ] | |
| Ventana | Pestaña o sistema | [ ] | [ ] | [ ] | [ ] | [ ] | |
| Pantalla | Sin audio | [ ] | [ ] | [ ] | [ ] | [ ] | |
| Pantalla | Pestaña o sistema | [ ] | [ ] | [ ] | [ ] | [ ] | |

### macOS

| Fuente | Audio | Se graba | Resolución = física | Audio | Abre en QuickTime | Abre en VLC | Notas |
|---|---|---|---|---|---|---|---|
| Pestaña | Sin audio | [ ] | [ ] | [ ] | [ ] | [ ] | |
| Pestaña | Pestaña o sistema | [ ] | [ ] | [ ] | [ ] | [ ] | |
| Ventana | Sin audio | [ ] | [ ] | [ ] | [ ] | [ ] | |
| Ventana | Pestaña o sistema | [ ] | [ ] | [ ] | [ ] | [ ] | |
| Pantalla | Sin audio | [ ] | [ ] | [ ] | [ ] | [ ] | |
| Pantalla | Pestaña o sistema | [ ] | [ ] | [ ] | [ ] | [ ] | |

«Abre en…» significa: el archivo guardado se reproduce, se puede saltar a mitad (arrastrar la barra) y el sonido y la imagen van a la vez. En macOS, el audio del sistema con ventana o pantalla exige macOS 14.2+ y Chrome 141+; en una versión anterior es normal que salga el aviso «Grabando sin sonido» y entonces no se marca «Audio».

## Los 7 puntos pendientes (especificación §8)

### 1. El selector abierto con una persona eligiendo

- [ ] Windows  [ ] macOS

Cómo comprobarlo: pulsa Grabar en el popup y elige tú a mano en el selector de Chrome (sin ninguna opción de pruebas). Debe abrirse el selector, y tras elegir, empezar la cuenta atrás de 3 segundos y grabar. Repite con el atajo `Alt+Mayús+R`. Si el selector no se abre, o Chrome se queja de que hace falta un gesto del usuario, falla.

Qué hacer si falla: plan B de la especificación (§3, «Reserva»): abrir una ventanita de la extensión que abre el selector y graba ella misma. El resto del diseño no cambia.

### 2. AAC en Windows y macOS

- [ ] Windows  [ ] macOS

Cómo comprobarlo: graba con audio («Pestaña o sistema») y ejecuta el segundo comando `ffprobe` de arriba sobre el archivo: debe salir `codec_name=aac`. Además, el popup no debe decir «No se puede grabar en MP4 en este Chrome». Para saber qué códec se usó, la prueba directa es el archivo; no hace falta abrir consolas.

Qué hacer si falla: sin AAC no hay MP4 con sonido garantizado. Apuntar el sistema y la versión de Chrome; la especificación (§4.2) prohíbe grabar en otro formato a escondidas, así que habría que decidir con el propietario una alternativa (por ejemplo MP4 sin audio, o conversión al guardar).

### 3. QuickTime y reproductor de Windows con el MP4 fragmentado

- [ ] QuickTime (macOS)  [ ] Reproductor de Windows

Cómo comprobarlo: abre el archivo guardado de una grabación de más de 1 minuto con cada reproductor. Comprueba que se abre, que saltar a mitad (arrastrar la barra) funciona, que la imagen no se queda congelada ni se descuadra con el sonido, y que la duración mostrada es correcta. En `ffprobe` o ffmpeg, los avisos «non monotonically increasing dts» son conocidos (Fase 1 §2): solo importan si el reproductor falla.

Qué hacer si falla: plan B de la especificación y de la Fase 1: reordenar el MP4 al guardar (reescribir las marcas de tiempo y el índice) en lugar de copiar los trozos tal cual.

### 4. Tope real del codificador (pantallas 5K)

- [ ] Windows (sin 5K, no aplica)  [ ] macOS (sin 5K, no aplica)

Cómo comprobarlo: necesita un monitor 5K o mayor (5120 × 2880 o más). Graba la pantalla completa y mira la vista previa: si avisa «Grabada a … reducida desde …», el tope actual de 4096×2304 se ha aplicado. Mide el archivo con `ffprobe` (`width` y `height`). Para saber si el sistema admite más, hay que probar subiendo el tope (`MAX_PIXELES` en `comun/calidad.js`, recargando la extensión) y ver si la grabación sale a la resolución física sin quedarse en negro ni cortarse.

Qué hacer si falla: si con tope 4096×2304 no llega a grabar (queda en el mensaje «No se ha podido grabar a esta resolución»), bajar el tope. Si graba bien reducida y el sistema admitía más, subir el tope. Anotar el modelo de gráfica y el sistema.

### 5. Audio del sistema con ventana y pantalla; que la pestaña grabada siga sonando

- [ ] Windows  [ ] macOS (14.2+, Chrome 141+)

Cómo comprobarlo: graba una ventana y luego la pantalla con «Pestaña o sistema» mientras suena una pestaña o una aplicación. En el selector, marca la casilla de compartir audio. Comprueba que (a) el archivo tiene el sonido (segundo `ffprobe`: `aac`) y (b) durante la grabación sigues oyendo el sonido por los altavoces o auriculares. Si Chrome no da el audio en tu caso, la extensión debe avisar «Grabando sin sonido» y seguir grabando.

Qué hacer si falla: si el sonido se graba pero deja de oírse en los altavoces, hay que reenviar el audio a los altavoces (era el diseño de la v1, retirado hasta ver si hacía falta). Si no hay audio del sistema en una versión de macOS o Chrome concreta, apuntarlo como limitación.

### 6. Redimensionar la ventana grabada

- [ ] Windows  [ ] macOS

Cómo comprobarlo: graba una ventana y, durante la grabación, cámbiale el tamaño (más grande y más pequeña). Guarda y reproduce: lo deseado es que el vídeo mantenga el tamaño inicial con el contenido escalado, sin parones, sin congelarse y sin que se corte la grabación. Mide `width` y `height` con `ffprobe` y anota si coinciden con el tamaño inicial.

Qué hacer si falla: si la grabación se corta o se estropea al cambiar el tamaño, anotarlo como limitación en el README («no cambies el tamaño de la ventana mientras grabas»); la especificación (§4.1) no define plan B más allá de ver qué hace Chrome.

### 7. Diálogo «Guardar como» en la vista previa

- [ ] Windows  [ ] macOS

Cómo comprobarlo: en la vista previa pulsa Guardar. Debe abrirse el diálogo de «Guardar como» del sistema con el nombre propuesto (`Título_AAAA-MM-DD_HH-MM.mp4`); elige carpeta y guarda: debe salir «Guardado como …» y el archivo debe estar en esa carpeta. Prueba también cancelar el diálogo (debe seguir en la vista previa sin perder nada) y guardar sobre un archivo que ya existe.

Qué hacer si falla: si el diálogo no se abre o da error de permiso, mirar el motivo que muestra la vista previa («No se ha podido guardar: …»). La especificación no tiene plan B (no hay permiso `downloads`); habría que decidirlo con el propietario.

## Lo que solo se puede comprobar en una máquina real

Cosas que las pruebas automáticas no pueden ver (en ellas no hay una persona pulsando el icono, ni un Mac, ni una hora entera de grabación). Anota en cada una lo que veas.

### Pastilla con el permiso real de la pestaña

- [ ] Windows  [ ] macOS — **Desde el popup:** abre una web normal (no `chrome://`), pulsa el icono, Grabar, y elige otra cosa en el selector. Tras la cuenta atrás, la pastilla debe aparecer abajo a la derecha de esa web.
- [ ] Windows  [ ] macOS — **Desde el atajo:** en una web normal, pulsa `Alt+Mayús+R` (Mac: `Opción ⌥ + Mayús ⇧ + R`). La pastilla también debe aparecer. (En las pruebas automáticas se da el permiso de otra forma; aquí se comprueba el de verdad, que Chrome solo concede al pulsar el icono o el atajo).

### Insignia legible

- [ ] Windows  [ ] macOS — Graba más de 10 minutos y mira el icono: el tiempo `mm:ss` (5 caracteres) debe leerse entero, sin cortarse. Si Chrome lo corta (p. ej. «12:3»), anótalo con una captura.

### Una grabación real de 60 minutos

- [ ] Windows  [ ] macOS — Graba la pantalla una hora entera (calidad Normal, 30 fotogramas). Comprueba:
  - [ ] A los 55 minutos sale el aviso «Quedan 5 minutos» en el popup y «Quedan 5 min» en la pastilla.
  - [ ] A los 60 minutos se para sola y la vista previa dice «La grabación se paró sola al llegar a una hora».
  - [ ] Guardar funciona con un archivo de varios GB. Ojo: mientras guarda, Chrome escribe una copia temporal (`.crswap`) y la renombra al final, así que hace falta en el disco unas **dos veces** lo que pesa la grabación. Anota el peso y el tiempo que tarda en guardar.
  - [ ] El archivo se abre en QuickTime (macOS) y en el reproductor de Windows, y se puede saltar a mitad y al final (arrastrando la barra) sin que se congele ni se desincronice el sonido. Un MP4 fragmentado largo es donde más fallan.

### Ventana con un tamaño impar

- [ ] Windows  [ ] macOS — Ajusta a mano una ventana para que su ancho o su alto sean impares (p. ej. 1001 × 701; arrastra el borde poco a poco) y grábala. Puede que el codificador del sistema no arranque a la primera: entonces, a los 5 segundos, la extensión reintenta más pequeño y avisa «Reintentando a menor resolución». Anota si pasa, y si al final graba.

### Cancelar con el selector abierto

- [ ] Windows  [ ] macOS — Pulsa Grabar y, con el selector de Chrome abierto, vuelve a abrir el popup y pulsa **Cancelar**. El selector debe cerrarse solo y el popup volver al formulario. Si el selector se queda abierto, anótalo (al elegir algo después no debe empezar ninguna grabación).
- [ ] Windows  [ ] macOS — Con el selector abierto, pulsa otra vez el atajo de grabar: no debe pasar nada (el selector sigue abierto). Una pulsación doble rápida no debe cancelar.

### La cuenta atrás en el vídeo

- [ ] Windows  [ ] macOS — Graba la pantalla con la pestaña de la cuenta atrás a la vista. En el archivo guardado, mira los primeros fotogramas: anota si se ve el círculo de la cuenta atrás (no debería: la grabación empieza al acabar la cuenta, pero el círculo tarda un instante en quitarse).

### Mac sin permiso de grabar la pantalla

- [ ] macOS — En Ajustes del Sistema → Privacidad y seguridad → Grabación de pantalla y audio del sistema, **desactiva** Chrome (o prueba antes de dárselo por primera vez). Graba una ventana o la pantalla: el popup debe decir «Chrome no tiene permiso para grabar la pantalla…» con esos mismos pasos, y **no** «Grabación cancelada». Repite justo después de activarlo sin reiniciar Chrome (debe salir el mismo mensaje) y después de reiniciarlo (debe grabar). Vuelve a dejar el permiso activado.

### Reabrir una grabación sin guardar

- [ ] Windows  [ ] macOS — Graba unos segundos, y en la vista previa cierra la pestaña sin guardar ni descartar. Abre el popup: debe decir «Tienes 1 grabación sin guardar» con el botón **Abrir**. Púlsalo: se abre la vista previa y se puede guardar.
- [ ] Windows  [ ] macOS — Con esa vista previa abierta, copia su dirección en otra pestaña: la segunda debe decir «Esta grabación ya está abierta en otra pestaña», sin botones.

## Comprobaciones extra que conviene hacer de paso

- [ ] Los atajos `Alt+Mayús+R` y `Alt+Mayús+P` (Mac: `Opción ⌥ + Mayús ⇧ + R` y `P`) no chocan con otro programa y funcionan con Chrome en primer plano.
- [ ] Al volver a abrir Chrome sale el aviso «Desactiva las extensiones en modo de desarrollador»: cerrarlo sin pulsar «Desactivar» deja la extensión funcionando.
- [ ] Parar en el primer instante (menos de 1 segundo) da «La grabación ha sido demasiado corta» y no deja nada a medias.
- [ ] Cerrar Chrome grabando y volver a abrirlo enseña «Grabación recuperada», y el archivo guardado se reproduce.
- [ ] En modo claro y modo oscuro del sistema, el popup y la vista previa se leen bien.
