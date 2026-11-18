# AGENTS.md

Pac-Man MVP: vanilla HTML/CSS/JS, no npm, no build, no tests. All app code lives in `src/`.

## Run / verify

```bash
python3 -m http.server 8000 --directory src   # play at http://localhost:8000
```

Opening `src/index.html` directly also works (classic scripts, no modules, no fetch). There is no lint/typecheck/test command; verify changes by playing in a browser and watching the console.

## Load order is the architecture

Scripts are plain globals (no imports). `src/index.html` must load them in this order, since each depends on the previous:

1. `js/maze.js` → `MAZE`, `TUNNEL_ROW`, `PACMAN_START`, `GHOST_STARTS`
2. `js/game.js` → `createGame`, `update`, `DIRS`
3. `js/render.js` → `draw`
4. `js/main.js` → canvas loop and keyboard

When adding a file, add its `<script>` tag in dependency order. Each file exports explicitly via `window.X = X` — keep that pattern.

## Game model gotchas

- `MAZE` is the pristine layout and must never be mutated. `createGame()` deep-copies it into `game.grid`; dots are eaten from `game.grid` only, which is what makes restarts work.
- Tile codes: `1` wall, `2` dot, `0` empty, `3` ghost-pen door. Pac-Man is blocked by `1` and `3`; ghosts only by `1` (see `isWall` in `game.js`).
- Movement is per-frame (no delta time) at fractional speeds (`PACMAN_SPEED = 0.125`, `GHOST_SPEED = 0.1`). Turning and eating happen only on the frame an actor is aligned to a cell center; keep new speeds on fractions that land exactly on integers or actors will drift/miss turn logic.
- Row `TUNNEL_ROW` (14) wraps horizontally via `wrapTunnel`; `canMove` treats leaving the grid on that row as valid.
- Canvas is fixed 560×620 = 28×31 tiles × `TILE` 20px (`render.js`). Changing maze size means updating `MAZE_STR` row lengths, the canvas `width`/`height` in `index.html`, and the `#game-wrap` size in `css/style.css`.
- HUD is drawn on the canvas at the top of the playfield; it overlaps row 0.

## Conventions

- Code comments and in-game UI strings are Spanish. Match that when editing.
- Code style: single quotes, spaces inside parens (`fn( x )`), 2-space indent.
- Branch/commit workflow for features is optional and skill-driven (see below), not required for small fixes.

## Spec-driven workflow

The project is a spec-driven exercise; skills live in `.agents/skills/` and are pinned in `skills-lock.json` (do not hand-edit those skills).

- `/spec` writes `specs/NN-slug.md` from `.agents/skills/spec/template.md` and creates `specs/.spec-config.yml` on first use. `specs/` does not exist yet.
- `/spec-impl NN-slug` only runs on a spec whose status is `Approved`/`Aprobado`; it creates branch `spec-NN-slug` and pauses after each step. With `AutoCommitSteps: true` it commits `spec-NN-step-MM`.
- Keep new specs in the same language and section shape as existing ones.
