# SPEC 01 — Cuatro fantasmas con personalidad propia

> **Estado:** Aprobado
> **Depende de:** —
> **Fecha:** 2026-11-18
> **Objetivo:** Ampliar el juego a cuatro fantasmas con comportamientos distintos entre sí, incluido un perseguidor agresivo que calcula la ruta más corta real hacia Pac-Man.

## Por qué existe este spec

Hoy `GHOST_STARTS` define dos fantasmas (`hunter` y `random`) y `decideGhost` solo conoce dos ramas. El `hunter` usa distancia Manhattan con una sola celda de mirada, así que se queda oscilando en callejones y no se siente agresivo. Este spec convierte el fantasma en una entidad con estado propio (espera, salida, activo) y una personalidad por tipo.

## Alcance

**In:**

- Cuatro fantasmas definidos en `GHOST_STARTS`: `chaser`, `ambusher`, `flanker` y `shy`.
- Una velocidad por tipo: solo el `chaser` va más rápido.
- Liberación escalonada por frames, con rebote dentro de la guarida mientras esperan.
- Salida guiada por la puerta y entrada en estado activo al llegar al pasillo superior.
- Búsqueda en anchura (BFS) sobre la rejilla para el `chaser`.
- Objetivo calculado por tipo para los otros tres.
- Color fijo por tipo en el render.
- Reinicio completo de los cuatro al perder una vida.

**Fuera de alcance (para specs futuros):**

- Power pellets y modo asustado.
- Ciclos globales de persecución/dispersión con temporizador.
- Formas o sprites distintos por fantasma; el color es el identificador.
- Sonido, pausa, niveles o progresión de dificultad.
- BFS para `ambusher`, `flanker` o `shy`.

## Modelo de datos

Geometría relevante del laberinto, ya existente:

- Guarida: filas 13–15, columnas 11–16, celdas transitables `0`.
- Puerta: fila 12, columnas 13–14, celdas `3`.
- Pasillo de salida: fila 11, columnas 10–19.
- El recinto está cerrado por muros en las columnas 10 y 17.

```js
// maze.js
const GHOST_STARTS = [
  { x: 13, y: 13, kind: "chaser" }, // rojo,   sale al instante
  { x: 14, y: 13, kind: "ambusher" }, // rosa,   sale a los 90 frames
  { x: 13, y: 14, kind: "flanker" }, // cian,   sale a los 180 frames
  { x: 14, y: 14, kind: "shy" }, // naranja, sale a los 270 frames
];
```

```js
// game.js
const GHOST_RULES = {
  chaser:   { speed: 0.125, releaseAfter: 0 },
  ambusher: { speed: 0.1,   releaseAfter: 90 },
  flanker:  { speed: 0.1,   releaseAfter: 180 },
  shy:      { speed: 0.1,   releaseAfter: 270 },
};

// Instancia dentro de game.ghosts
{
  x: 13, y: 13, dir: 'up',
  speed: 0.125,
  kind: 'chaser',
  state: 'waiting',   // 'waiting' | 'exiting' | 'active'
  wait: 0,            // frames restantes en 'waiting'
}
```

```js
// render.js
const GHOST_COLORS = {
  chaser: "#ff0000",
  ambusher: "#ffb8ff",
  flanker: "#00ffff",
  shy: "#ffb852",
};
```

Convenciones:

- Coordenadas por celda, origen arriba-izquierda.
- Velocidades en celdas por frame; se mantienen fracciones que alinean en enteros exactos (`1/8` y `1/10`).
- `wait` se mide en frames de `requestAnimationFrame` (~60 fps). No se usa delta time.

## Plan de implementación

1. En `src/js/maze.js`, sustituir `GHOST_STARTS` por las cuatro entradas con sus `kind`. El juego sigue jugable porque los tipos nuevos caen en la rama aleatoria de `decideGhost`. Prueba: se ven cuatro fantasmas moviéndose al azar.
2. En `src/js/game.js`, añadir `GHOST_RULES` y hacer que `createGame` y `resetPositions` lean velocidad, `state` y `wait` de cada instancia. Prueba: cuatro fantasmas, el rojo visiblemente más rápido.
3. Implementar el ciclo de guarida en `moveGhost`: en `waiting` se descuenta `wait` y el fantasma rebota en vertical entre las filas 13 y 15 de su columna; al llegar a 0 pasa a `exiting`. En `exiting` sube recto por la puerta hasta la fila 11 y pasa a `active`. La celda `3` cuenta como muro solo en `waiting`. Prueba: orden de salida rojo, rosa, cian, naranja, con ~1,5 s entre cada uno, sin atascos.
4. Añadir `nextStepTo( grid, from, to )` con BFS y usarla en `chaser` para elegir dirección en cada celda alineada; si no hay camino, cae al aleatorio. Prueba: el rojo recorta distancia por el camino real y no oscila.
5. Implementar `ambusher`: objetivo = celda de Pac-Man + 4 celdas en su dirección, recortado a los límites; si cae en muro, objetivo = celda de Pac-Man. Prueba: el rosa se adelanta en lugar de seguirlo.
6. Implementar `flanker`: objetivo = 2 × (celda de Pac-Man + 2 en su dirección) − celda del `chaser`, recortado a los límites; si cae en muro, objetivo = celda de Pac-Man. Prueba: el cian aparece por el lado opuesto al rojo.
7. Implementar `shy`: con distancia Manhattan > 8 persigue la celda de Pac-Man; en caso contrario elige la dirección que maximiza la distancia. Prueba: se acerca, se aleja al acercarse y repite.
8. En `src/js/render.js`, cambiar `GHOST_COLORS` a mapa por `kind` y pasar `g.kind` desde `draw`. Prueba: cada tipo conserva su color aunque cambie el orden.

Regla de desempate común a los pasos 4–7: se excluye la dirección contraria salvo callejón sin salida; los candidatos se evalúan empezando por la dirección actual y luego en el orden `left`, `right`, `up`, `down`; gana la primera con mejor valor y los empates conservan la anterior.

## Criterios de aceptación

- [ ] La consola no muestra errores al cargar ni al jugar.
- [ ] Hay exactamente cuatro fantasmas, con color rojo, rosa, cian y naranja respectivamente.
- [ ] El rojo sale de la guarida de inmediato; el rosa a los ~90 frames; el cian a los ~180; el naranja a los ~270.
- [ ] Los fantasmas en espera rebotan dentro de la guarida y no cruzan la puerta antes de su turno.
- [ ] Al liberarse, cada fantasma sube recto por la puerta y termina en la fila 11 sin quedarse atascado.
- [ ] El rojo avanza siempre por un camino más corto real hacia Pac-Man y no se queda oscilando en una esquina.
- [ ] El rosa apunta a la celda 4 por delante de Pac-Man; si esa celda es muro, apunta a Pac-Man.
- [ ] El cian usa la fórmula `2 × (Pac-Man + 2 al frente) − rojo` y ataca por el lado opuesto al rojo.
- [ ] El naranja persigue a más de 8 celdas de distancia y se aleja a menos de 8.
- [ ] Los fantasmas no comen dots, no atraviesan paredes y siguen usando el túnel de la fila 14.
- [ ] Al perder una vida, los cuatro vuelven a su celda de salida en estado de espera y el orden de liberación se repite.
- [ ] Las partidas siguen terminando en victoria al comer todos los dots y en derrota al agotar las 3 vidas.

## Decisiones tomadas y descartadas

- **Sí:** las cuatro personalidades clásicas. Se distinguen sin explicación y no exigen arte nuevo.
- **Sí:** BFS solo para el `chaser`. Es el fantasma que el jugador percibe como agresivo; el coste de escribir BFS para los cuatro no aporta una diferencia visible.
- **Sí:** velocidades por tipo con `1/8` y `1/10`. Ambas alinean en enteros y no rompen la lógica de giro por celda.
- **Sí:** liberación por frames en lugar de por dots. Es predecible y no depende de lo rápido que coma el jugador.
- **Sí:** rebote vertical dentro de la guarida. Da vida a la espera sin lógica de patrullaje interna; al estar en las columnas 13–14, la salida siempre es recta.
- **Sí:** salida guiada por estado `exiting` en lugar de dejar decidir a la IA. Garantiza que ningún fantasma quede encerrado.
- **Sí:** color por `kind` en el render. Desacopla el color del orden de `GHOST_STARTS`.
- **Aceptado:** los fantasmas pueden solaparse dentro de la guarida. No hay colisión entre fantasmas y el solape dura pocos frames.
- **No:** archivo nuevo `ghosts.js`. Las reglas ya viven en `game.js` y añadir un script obliga a tocar el orden de carga de `index.html`.
- **No:** ciclos de dispersión, power pellets o modo asustado. Merecen su propio spec.

## Riesgos

| Riesgo                                                                                      | Mitigación                                                                              |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Un fantasma en espera escapa antes de tiempo porque la puerta es transitable para fantasmas | En `waiting` la celda `3` se trata como muro; solo `exiting` la atraviesa               |
| El rebote se sale de la guarida hacia el túnel de la fila 14                                | El recinto está cerrado en las columnas 10 y 17 y el rebote se limita a las filas 13–15 |
| El perseguidor se queda quieto si Pac-Man está en una celda inalcanzable                    | `nextStepTo` devuelve `null` y ese frame se elige una dirección aleatoria válida        |
| Zigzag por empates en la distancia                                                          | Los candidatos se ordenan con la dirección actual primero                               |
| Cuatro fantasmas hacen el juego injusto                                                     | 3 vidas, liberación escalonada y solo el rojo por encima de `0.1`                       |
| Coste de BFS cada frame                                                                     | Solo lo usa el rojo y solo en celdas alineadas; la rejilla tiene 28×31 celdas           |

## Lo que **no** va en este spec

- Power pellets y modo asustado.
- Ciclos globales de persecución y dispersión.
- Formas, sprites o animaciones nuevas por fantasma.
- Sonido y pausa.
- Niveles o progresión de dificultad.
- BFS para `ambusher`, `flanker` y `shy`.

Cada uno de esos, si llega, va en su propio spec.
