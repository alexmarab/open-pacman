# SPEC 02 — Power pellets y modo asustado

> **Estado:** Aprobado
> **Depende de:** SPEC 01
> **Fecha:** 2026-11-18
> **Objetivo:** Añadir cuatro power pellets que activan un modo asustado temporal en el que Pac-Man puede comer fantasmas.

## Por qué existe este spec

El SPEC 01 dejó fuera de alcance los power pellets y el modo asustado. Hoy el jugador solo puede huir: no hay forma de contraatacar ni de convertir la persecución en puntos. Este spec añade la mecánica clásica que falta para que la partida tenga ciclos de riesgo y recompensa, sin tocar niveles ni progresión.

## Alcance

**In:**

- Cuatro power pellets en las esquinas del laberinto, con código de celda propio.
- Modo asustado global de 360 frames al comer un pellet.
- Huida a media velocidad e inversión de dirección de los fantasmas activos al activarse.
- Comer fantasmas con puntuación 200/400/800/1600 dentro del mismo pellet.
- Estado `eaten`: los ojos vuelven a la guarida por BFS, esperan 60 frames y salen otra vez.
- Render: pellet grande, cuerpo azul, parpadeo final y ojos sin cuerpo.
- Corte del susto al perder una vida, conservando los pellets ya comidos.
- La victoria exige comer también los cuatro pellets.

**Fuera de alcance (para specs futuros):**

- Ciclos globales de persecución y dispersión con temporizador.
- Frutas, niveles y progresión de dificultad.
- Sonido, pausa y animaciones nuevas por fantasma.
- BFS para `ambusher`, `flanker` o `shy`.
- Cambios en la velocidad base de los actores.

## Modelo de datos

Códigos de celda: `1` pared, `2` dot, `0` vacío, `3` puerta, `4` power pellet.

```js
// maze.js — solo cambian estas dos filas de MAZE_STR
'o...........##...........o', // 1   pellets en (1,1) y (26,1)
...
'#o........................o#', // 29  pellets en (1,29) y (26,29)
```

```js
// maze.js — parseTile
if (ch === "o") return 4; // power pellet
```

```js
// game.js — constantes nuevas
const FRIGHTENED_FRAMES = 360; // ~6 s a 60 fps
const FRIGHTENED_FLASH = 60; // ultimos frames de aviso
const FRIGHTENED_SPEED = 0.03125; // 1/32 celda/frame
const EATEN_SPEED = 0.125; // 1/8 celda/frame
const EATEN_WAIT = 60; // frames en la guarida antes de volver a salir
const PELLET_SCORE = 50;
const GHOST_SCORES = [200, 400, 800, 1600];
const EATEN_TARGET = { x: 13, y: 13 }; // celda de la guarida a la que vuelven los ojos
```

```js
// game.js — estado de la partida (solo lo nuevo)
{
  dotsRemaining, // celdas tipo 2 que quedan
  pelletsRemaining, // celdas tipo 4 que quedan (arranca en 4)
  frightened: 0, // frames de susto restantes; 0 = sin susto
  eatenCombo: 0, // fantasmas comidos con el pellet actual (0..4)
}
```

```js
// game.js — instancia de fantasma (solo cambia el conjunto de estados)
{
  x: 13, y: 13, dir: 'up',
  speed: 0.0625, // velocidad efectiva actual
  kind: 'chaser',
  state: 'waiting', // 'waiting' | 'exiting' | 'active' | 'eaten'
  wait: 0,
}
```

Convenciones:

- "Asustado" **no** es un estado del fantasma: se deriva de `game.frightened > 0 && g.state === 'active'`.
- `g.speed` se recalcula **solo en celdas alineadas**: `0.03125` si está asustado, `0.125` si está `eaten`, y `GHOST_RULES[ kind ].speed` en el resto.
- Velocidades base actuales: `0.0625` el `chaser` y `0.05` los otros tres (ajuste posterior al SPEC 01, que documenta `0.125`/`0.1`).
- El pellet se come igual que un dot y no bloquea a ningún actor.

## Plan de implementación

1. En `src/js/maze.js`, poner `'o'` en las cuatro esquinas de `MAZE_STR` y mapearlo a `4` en `parseTile`. En `src/js/render.js`, dibujar el tipo `4` con radio 5 en `drawDots`. En `src/js/game.js`, contar `pelletsRemaining` en `createGame`. Prueba: se ven cuatro pellets grandes en las esquinas y el juego sigue jugable, todavía sin comerlos.
2. En `src/js/game.js`, comer el tipo `4` en `movePacman` (celda a `0`, `score += PELLET_SCORE`, `pelletsRemaining--`). Prueba: al pasar por encima desaparecen y el marcador sube 50.
3. En `src/js/game.js`, añadir `frightened` y `eatenCombo`; al comer pellet, `frightened = FRIGHTENED_FRAMES`, `eatenCombo = 0` e invertir `dir` de los fantasmas `active`. Descontar `frightened` una vez por frame en `update` y poner `eatenCombo = 0` al llegar a 0. Añadir `ghostSpeed( game, g )` y aplicarla en `moveGhost` en cada celda alineada. IA de huida con `greedyDir` maximizando la distancia Manhattan a Pac-Man. Prueba: los fantasmas activos se dan la vuelta, van más lentos y se dibujan azules ~6 s.
4. En `src/js/render.js`, cuerpo azul `#2121ff` para los asustados y alternancia azul/blanco cada 15 frames cuando `game.frightened <= FRIGHTENED_FLASH`. Prueba: se ve el aviso antes de que acabe el susto.
5. En `src/js/game.js`, colisión con fantasma asustado → `state = 'eaten'`, `score += GHOST_SCORES[ eatenCombo ]`, `eatenCombo++`, sin perder vida. Prueba: dos fantasmas comidos con un pellet suman 200 y 400.
6. En `src/js/game.js` y `src/js/render.js`, IA de `eaten` con `nextStepTo` hacia `EATEN_TARGET` a `EATEN_SPEED`; al llegar, `state = 'waiting'` y `wait = EATEN_WAIT`. Se dibuja solo con ojos y no colisiona con Pac-Man. Prueba: los ojos vuelven a la guarida, esperan y salen otra vez.
7. En `src/js/game.js`, `resetPositions` corta `frightened` y `eatenCombo`; los pellets comidos siguen comidos y al acabar el susto cada fantasma recupera su velocidad y color. Prueba: perder una vida quita el azul y no devuelve pellets.
8. En `src/js/game.js`, la victoria exige `dotsRemaining <= 0 && pelletsRemaining <= 0`. Prueba: comer los cuatro pellets y todos los dots da victoria; comer solo dots no.

## Criterios de aceptación

- [ ] La consola no muestra errores al cargar ni al jugar.
- [ ] Hay exactamente cuatro pellets dibujados más grandes que un dot, en (1,1), (26,1), (1,29) y (26,29).
- [ ] Comer un pellet suma 50 puntos, lo borra de la rejilla y no reaparece al perder una vida.
- [ ] Comer un pellet activa el susto durante 360 frames; comer otro pellet reinicia el contador.
- [ ] Al activarse el susto, cada fantasma `active` invierte su dirección exactamente una vez.
- [ ] Los fantasmas asustados se mueven a 0.03125 celdas/frame y eligen en cada celda la dirección válida que maximiza la distancia Manhattan a Pac-Man.
- [ ] Los fantasmas asustados se dibujan azules y, en los últimos 60 frames, alternan azul y blanco cada 15 frames.
- [ ] Tocar un fantasma asustado lo convierte en ojos, suma 200/400/800/1600 según el orden dentro del pellet y no resta vida.
- [ ] Los ojos vuelven a la guarida por el camino más corto a 0.125 celdas/frame, se dibujan sin cuerpo y no matan a Pac-Man.
- [ ] Al llegar a la guarida, el fantasma espera 60 frames en `waiting` y vuelve a salir por la puerta.
- [ ] Al terminar el susto, los fantasmas recuperan su color y su velocidad de tipo.
- [ ] Perder una vida cancela el susto y reinicia `eatenCombo`; los cuatro fantasmas vuelven a la guarida y los pellets comidos siguen comidos.
- [ ] La victoria exige comer los cuatro pellets y todos los dots.
- [ ] Siguen funcionando las reglas del SPEC 01: túnel, fantasmas que no atraviesan muros ni comen dots, y derrota al agotar las 3 vidas.

## Decisiones tomadas y descartadas

- **Sí:** cuatro pellets en (1,1), (26,1), (1,29) y (26,29). Son las celdas más alejadas de la guarida y obligan a cruzar el mapa.
- **Sí:** 360 frames de susto (~6 s). Comer otro pellet reinicia el contador.
- **Sí:** huida a `0.03125` (1/32) y solo para fantasmas `active`. Los de la guarida mantienen su turno.
- **Sí:** inversión de dirección al activarse el susto. Da al jugador un instante para reaccionar.
- **Sí:** estado `eaten` con BFS a (13,13) a `0.125` y 60 frames de espera. Reutiliza `nextStepTo` y el ciclo de guarida del SPEC 01.
- **Sí:** 50 puntos por pellet y 200/400/800/1600 por fantasma. El combo se reinicia con cada pellet y al terminar el susto.
- **Sí:** los pellets cuentan para la victoria.
- **Sí:** perder una vida corta el susto y reinicia el combo; los pellets comidos se conservan. Restaurarlos premiaría morir.
- **Sí:** el susto es estado global derivado (`game.frightened` + `state === 'active'`), no un estado por fantasma. Evita sincronizar cuatro temporizadores.
- **Sí:** los cambios de velocidad se aplican **solo en celdas alineadas**. Mantiene la alineación exacta y la lógica de giro por celda que exige AGENTS.md.
- **Aceptado:** dos ojos pueden volar a la misma celda y solaparse; dura pocos frames.
- **Aceptado:** un fantasma asustado puede quedar acorralado y ser comido; es parte del juego.
- **No:** estado `'frightened'` por fantasma. Cuatro temporizadores que sincronizar no aportan nada visible.
- **No:** restaurar los pellets al perder una vida.
- **No:** frutas, niveles, sonido ni ciclos de dispersión. Cada uno va en su propio spec.

## Riesgos

| Riesgo                                                                                    | Mitigación                                                                                                      |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Cambiar de velocidad a mitad de celda descuadra la alineación y el fantasma deja de girar | `g.speed` se aplica solo en celdas alineadas; las fracciones 1/8, 1/16, 1/20 y 1/32 vuelven siempre a un entero |
| Un fantasma asustado se queda atascado huyendo en un callejón                             | Mismo desempate que el SPEC 01: el giro de 180 solo se permite si no hay otra salida                            |
| El susto termina mientras un fantasma está `eaten`                                        | `eaten` manda sobre el temporizador; solo vuelve a asustarse si sale con el susto aún activo                    |
| Los ojos cruzan la puerta y parece que atraviesan la guarida                              | Es el camino correcto; en `eaten` no hay colisión con Pac-Man                                                   |
| Comer un pellet con los cuatro fantasmas en la guarida                                    | No hay nada que invertir; el temporizador corre igual y se asustan al salir si queda tiempo                     |
| Parpadeo molesto o problemático para fotosensibilidad                                     | Alternancia cada 15 frames (2 Hz) y solo durante 1 s                                                            |
| La huida por Manhattan puede encajonar a un fantasma                                      | Aceptado: es el comportamiento clásico y el jugador solo gana puntos                                            |

## Lo que **no** va en este spec

- Ciclos globales de persecución y dispersión.
- Frutas, niveles y progresión de dificultad.
- Sonido, pausa y animaciones nuevas.
- Cambios en la velocidad base de los actores.
- BFS para `ambusher`, `flanker` o `shy`.

Cada uno de esos, si llega, va en su propio spec.
