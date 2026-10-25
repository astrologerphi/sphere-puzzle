# Sphere Puzzle

A WebGPU puzzle: pieces of a sphere float over a glass "base sphere" that has latitude/longitude lines and X/Y/Z axes.

## Run

```sh
npm install
npm run build      # bundles src/ into dist/
npx http-server dist
```

You need a browser with WebGPU (recent Chrome, Edge or Safari).

## Shapes

The left panel loads the default shapes from `src/puzzle/shapes.ts`. Click **Add**, paste a shape as JSON and press **OK**. Before a shape is added:

- `r` (radial distance) is clamped to `0.5 – 2`, and defaults to `1` if it is missing.
- Vertices are keyed by time (`0 – 24`). A vertex at time `0` and one at time `12` are required.

## Saving

The puzzle is saved to `localStorage` (key `sphere-puzzle:v1`) whenever it changes. Saved state includes the shapes, their placement and radial distance, the center-ray toggle and the camera view. The default shapes are loaded only when nothing valid is saved. To start over, clear the site data.

## Controls

| Input                                     | No selection    | Piece(s) selected               |
| ----------------------------------------- | --------------- | ------------------------------- |
| Left mouse drag                           | orbit the scene | orbit the scene                 |
| Mouse wheel                               | zoom            | change the radial distance      |
| ← / →                                     |                 | move along the longitude        |
| ↑ / ↓                                     |                 | move along the latitude         |
| Shift + ← / →                             |                 | rotate                          |
| Click a piece or card                     | select          | select only it / deselect       |
| Ctrl (⌘) or Shift + click a piece or card | select          | add to / remove from selection  |
| Esc / Delete                              |                 | deselect / remove the selection |

When several shapes are selected they act as one new shape: every key press applies the same rotation to all of them,
so they keep their arrangement. Latitude moves and rotation use the group's center (the arc-length weighted center of
all the selected outlines, the same rule as for a single shape). The mouse wheel changes every selected radial distance
by the same amount and stops when any piece reaches `0.5` or `2`.

Each card in the shape list has a chevron that expands it to show the shape's vertices in time order: the clock time
(yellow dot for day, blue for night) and θ / φ in degrees, with the radians from the JSON underneath.

## Layout

- `src/index.html`: all markup
- `src/styles/`: all CSS
- `src/shaders/`: all WGSL shaders
- `src/puzzle/`: shapes, validation, state and the shape-list UI
- `src/render/`: camera, WebGPU renderer and per-frame scene building
