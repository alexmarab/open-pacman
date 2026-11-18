// game.js
// Estado y reglas. Depende de globals de maze.js: MAZE, TUNNEL_ROW,
// PACMAN_START, GHOST_STARTS.

const DIRS = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
};
const OPPOSITE = { left: 'right', right: 'left', up: 'down', down: 'up' };
// Orden de desempate comun a toda la IA: tras la direccion actual.
const TIE_ORDER = [ 'left', 'right', 'up', 'down' ];

const PACMAN_SPEED = 0.125; // 1/8 celda/frame -> alinea cada 8 frames

// Personalidad por tipo: velocidad (celdas/frame) y frames de espera en la
// guarida antes de poder salir. Las fracciones 1/8 y 1/10 alinean en enteros.
const GHOST_RULES = {
  chaser: { speed: 0.125, releaseAfter: 0 },
  ambusher: { speed: 0.1, releaseAfter: 90 },
  flanker: { speed: 0.1, releaseAfter: 180 },
  shy: { speed: 0.1, releaseAfter: 270 },
};

// Estado inicial de un fantasma a partir de su entrada en GHOST_STARTS.
function ghostFromStart( start ) {
  const rule = GHOST_RULES[ start.kind ] || GHOST_RULES.chaser;
  return {
    x: start.x,
    y: start.y,
    dir: 'up',
    speed: rule.speed,
    kind: start.kind,
    state: 'waiting', // 'waiting' | 'exiting' | 'active'
    wait: rule.releaseAfter, // frames restantes en 'waiting'
  };
}

// Crea una partida nueva. Copia MAZE (pristino) a game.grid para poder comer
// dots sin destruir el original, y reiniciar.
function createGame() {
  const grid = MAZE.map( ( row ) => row.slice() );
  // La celda de inicio de Pacman arranca sin dot.
  grid[ PACMAN_START.y ][ PACMAN_START.x ] = 0;

  let dots = 0;
  for ( const row of grid ) for ( const v of row ) if ( v === 2 ) dots++;

  return {
    state: 'start',
    score: 0,
    lives: 3,
    dotsRemaining: dots,
    grid,
    pacman: {
      x: PACMAN_START.x,
      y: PACMAN_START.y,
      dir: 'left',
      nextDir: null,
      speed: PACMAN_SPEED,
    },
    ghosts: GHOST_STARTS.map( ghostFromStart ),
  };
}

function aligned( v ) {
  return Math.abs( v - Math.round( v ) ) < 1e-3;
}

// Una celda es muro para el actor dado?
//   pacman:     bloqueado por pared (1) y puerta (3)
//   ghost:      bloqueado solo por pared (1)
//   ghost-wait: fantasma esperando en la guarida; la puerta (3) tambien le bloquea
function isWall( grid, x, y, actor ) {
  if ( y < 0 || y >= grid.length ) return true;
  if ( x < 0 || x >= grid[ 0 ].length ) return true;
  const v = grid[ y ][ x ];
  if ( v === 1 ) return true;
  if ( v === 3 && ( actor === 'pacman' || actor === 'ghost-wait' ) ) return true;
  return false;
}

// Puede el actor avanzar desde (x,y) en la direccion dir?
function canMove( grid, x, y, dir, actor ) {
  const d = DIRS[ dir ];
  if ( !d ) return false;
  const tx = x + d.x;
  const ty = y + d.y;
  // Tunel: salir por un borde en la fila del tunel siempre es valido.
  if ( ty === TUNNEL_ROW && ( tx < 0 || tx >= grid[ 0 ].length ) ) return true;
  return !isWall( grid, tx, ty, actor );
}

function wrapTunnel( a, width ) {
  if ( Math.round( a.y ) === TUNNEL_ROW ) {
    if ( a.x < 0 ) a.x += width;
    else if ( a.x >= width ) a.x -= width;
  }
}

function movePacman( game ) {
  const p = game.pacman;
  const grid = game.grid;
  const width = grid[ 0 ].length;

  if ( aligned( p.x ) && aligned( p.y ) ) {
    p.x = Math.round( p.x );
    p.y = Math.round( p.y );

    // Aplicar giro pendiente si es posible.
    if ( p.nextDir && canMove( grid, p.x, p.y, p.nextDir, 'pacman' ) ) {
      p.dir = p.nextDir;
      p.nextDir = null;
    }
    // Comer dot.
    if ( grid[ p.y ][ p.x ] === 2 ) {
      grid[ p.y ][ p.x ] = 0;
      game.score += 10;
      game.dotsRemaining--;
    }
    // Si no puede seguir, se detiene en la celda.
    if ( !canMove( grid, p.x, p.y, p.dir, 'pacman' ) ) return;
  }

  const d = DIRS[ p.dir ];
  p.x += d.x * p.speed;
  p.y += d.y * p.speed;
  wrapTunnel( p, width );
}

// En la fila del tunel, salir por un borde entra por el opuesto.
function wrapX( x, y, width ) {
  if ( y !== TUNNEL_ROW ) return x;
  if ( x < 0 ) return width - 1;
  if ( x >= width ) return 0;
  return x;
}

// Candidatos de giro en una celda, en orden de desempate: primero la direccion
// actual y luego left/right/up/down. Se excluye el giro de 180 salvo que sea la
// unica salida (callejon sin salida).
function ghostChoices( grid, g ) {
  const options = [];
  for ( const dir of [ g.dir, ...TIE_ORDER ] ) {
    if ( !dir || dir === OPPOSITE[ g.dir ] || options.includes( dir ) ) continue;
    if ( canMove( grid, g.x, g.y, dir, 'ghost' ) ) options.push( dir );
  }
  if ( options.length ) return options;
  const back = OPPOSITE[ g.dir ];
  return canMove( grid, g.x, g.y, back, 'ghost' ) ? [ back ] : [];
}

// Distancia en celdas por el camino mas corto entre dos celdas (BFS sobre la
// rejilla, tunel incluido). Devuelve Infinity si no hay camino.
function bfsDistance( grid, from, to ) {
  const W = grid[ 0 ].length;
  const H = grid.length;
  const dist = new Array( W * H ).fill( -1 );
  const start = from.y * W + from.x;
  const goal = to.y * W + to.x;
  dist[ start ] = 0;
  const queue = [ start ];
  for ( let head = 0; head < queue.length; head++ ) {
    const cell = queue[ head ];
    if ( cell === goal ) return dist[ cell ];
    const cx = cell % W;
    const cy = ( cell - cx ) / W;
    for ( const dir of TIE_ORDER ) {
      if ( !canMove( grid, cx, cy, dir, 'ghost' ) ) continue;
      const d = DIRS[ dir ];
      const ny = cy + d.y;
      const nx = wrapX( cx + d.x, ny, W );
      const next = ny * W + nx;
      if ( dist[ next ] !== -1 ) continue;
      dist[ next ] = dist[ cell ] + 1;
      queue.push( next );
    }
  }
  return Infinity;
}

// Direccion del primer paso del camino mas corto (BFS) desde la celda de 'from'
// hasta 'to'. Aplica la regla de desempate comun: sin giro de 180 salvo
// callejon, candidatos en orden de ghostChoices y gana el primero con mejor
// distancia. Devuelve null si no hay camino.
function nextStepTo( grid, from, to ) {
  const choices = ghostChoices( grid, from );
  let best = null;
  let bestDist = Infinity;
  for ( const dir of choices ) {
    const d = DIRS[ dir ];
    const ny = from.y + d.y;
    const nx = wrapX( from.x + d.x, ny, grid[ 0 ].length );
    const dist = bfsDistance( grid, { x: nx, y: ny }, to );
    if ( dist < bestDist ) {
      bestDist = dist;
      best = dir;
    }
  }
  return Number.isFinite( bestDist ) ? best : null;
}

// Distancia Manhattan entre dos celdas (acepta posiciones fraccionarias).
function manhattan( a, b ) {
  return Math.abs( Math.round( a.x ) - Math.round( b.x ) ) + Math.abs( Math.round( a.y ) - Math.round( b.y ) );
}

// Recorta una celda a los limites de la rejilla.
function clampCell( grid, x, y ) {
  return {
    x: Math.max( 0, Math.min( grid[ 0 ].length - 1, x ) ),
    y: Math.max( 0, Math.min( grid.length - 1, y ) ),
  };
}

// Celda objetivo de las personalidades que no usan BFS.
function ghostTarget( game, g ) {
  const grid = game.grid;
  const p = game.pacman;
  const px = Math.round( p.x );
  const py = Math.round( p.y );
  const pd = DIRS[ p.dir ] || { x: 0, y: 0 };

  let target = { x: px, y: py };
  if ( g.kind === 'ambusher' ) {
    // 4 celdas por delante de Pac-Man, recortado a los limites.
    target = clampCell( grid, px + pd.x * 4, py + pd.y * 4 );
  }

  // Si el objetivo cae en muro, apuntar a la celda de Pac-Man.
  return isWall( grid, target.x, target.y, 'ghost' ) ? { x: px, y: py } : target;
}

// Direccion que minimiza (o maximiza) la distancia Manhattan al objetivo entre
// los candidatos, en su orden de desempate.
function greedyDir( g, choices, target, minimize ) {
  let best = choices[ 0 ];
  let bestDist = minimize ? Infinity : -Infinity;
  for ( const dir of choices ) {
    const d = DIRS[ dir ];
    const dist = Math.abs( g.x + d.x - target.x ) + Math.abs( g.y + d.y - target.y );
    if ( minimize ? dist < bestDist : dist > bestDist ) {
      bestDist = dist;
      best = dir;
    }
  }
  return best;
}

function decideGhost( game, g ) {
  const grid = game.grid;
  const choices = ghostChoices( grid, g );
  if ( !choices.length ) return;

  if ( g.kind === 'chaser' ) {
    const target = { x: Math.round( game.pacman.x ), y: Math.round( game.pacman.y ) };
    const step = nextStepTo( grid, g, target );
    // Sin camino: una direccion aleatoria valida para no quedarse quieto.
    g.dir = step || choices[ Math.floor( Math.random() * choices.length ) ];
    return;
  }

  if ( g.kind === 'ambusher' ) {
    g.dir = greedyDir( g, choices, ghostTarget( game, g ), true );
    return;
  }

  g.dir = choices[ Math.floor( Math.random() * choices.length ) ];
}

// Ciclo de la guarida. 'waiting' cuenta frames y rebota en vertical dentro de
// la pen; 'exiting' sube recto por la puerta hasta el pasillo de la fila 11 y
// pasa a 'active'; 'active' usa la personalidad de su tipo.
const PEN_TOP = 13;
const PEN_BOTTOM = 15;
const PEN_EXIT_ROW = 11;

function moveGhost( game, g ) {
  const grid = game.grid;
  const width = grid[ 0 ].length;

  // La espera se mide en frames, no en celdas alineadas.
  if ( g.state === 'waiting' ) {
    if ( g.wait > 0 ) g.wait--;
    if ( g.wait <= 0 ) g.state = 'exiting';
  }

  if ( aligned( g.x ) && aligned( g.y ) ) {
    g.x = Math.round( g.x );
    g.y = Math.round( g.y );

    let actor = 'ghost';
    if ( g.state === 'waiting' ) {
      actor = 'ghost-wait';
      // Rebote vertical entre las filas 13 y 15 de su columna.
      if ( g.y <= PEN_TOP ) g.dir = 'down';
      else if ( g.y >= PEN_BOTTOM ) g.dir = 'up';
      if ( !canMove( grid, g.x, g.y, g.dir, actor ) ) g.dir = OPPOSITE[ g.dir ];
    } else if ( g.state === 'exiting' ) {
      g.dir = 'up';
      if ( g.y <= PEN_EXIT_ROW ) {
        g.y = PEN_EXIT_ROW;
        g.state = 'active';
      }
    } else {
      decideGhost( game, g );
    }

    if ( !canMove( grid, g.x, g.y, g.dir, actor ) ) return;
  }

  const d = DIRS[ g.dir ];
  g.x += d.x * g.speed;
  g.y += d.y * g.speed;
  wrapTunnel( g, width );
}

function resetPositions( game ) {
  const p = game.pacman;
  p.x = PACMAN_START.x;
  p.y = PACMAN_START.y;
  p.dir = 'left';
  p.nextDir = null;
  game.ghosts.forEach( ( g, i ) => {
    Object.assign( g, ghostFromStart( GHOST_STARTS[ i ] ) );
  } );
}

function collides( a, b ) {
  return Math.abs( a.x - b.x ) < 0.5 && Math.abs( a.y - b.y ) < 0.5;
}

function update( game ) {
  movePacman( game );
  game.ghosts.forEach( ( g ) => moveGhost( game, g ) );

  for ( const g of game.ghosts ) {
    if ( collides( game.pacman, g ) ) {
      game.lives--;
      if ( game.lives <= 0 ) {
        game.state = 'lost';
        return;
      }
      resetPositions( game );
      break;
    }
  }

  if ( game.dotsRemaining <= 0 ) game.state = 'won';
}

window.createGame = createGame;
window.update = update;
window.DIRS = DIRS;
