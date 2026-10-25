# Floating interface

Turnbit keeps its open, radial composition. The visual finish in
`renderer/polish.css` uses native Segoe UI typography, restrained mint accents,
stable playback columns, and short feedback transitions. Selection has stronger
weight; secondary metadata uses quieter type rather than competing spacing.
Compact playback reduces artwork before hiding album metadata.

Drag the small Turnbit wordmark at the top to move the window. Drag Resize at
the bottom to scale its bounds proportionally. Both handles reveal extra detail
on hover or focus. Escape cancels a drag. Placement is saved locally in
`floating-placement.json` under Electron's user-data directory. Changing a Size
& Position setting returns to the requested docked layout; startup restores a
saved placement only when its layout settings match, with display bounds checks.

Reduced-motion preferences disable spatial and repeating decorative motion,
while retaining short color and opacity feedback. Reduced-transparency
preferences give the content a solid backing. Existing appearance preferences
and the turnbit interface remains the active interface.

Validation: `npm run check` and `electron scripts/verify-polish.js`.
The latter uses isolated demo data and captures both edges under `artifacts/`;
it checks compact playback, pointer-driven movement and proportional resizing,
cancel behavior, and saved bounds. `electron scripts/verify-layout.js` checks
the existing Size & Position settings independently.

## Scaling rules

The window player is designed at about 1440 × 880 (720 × 1000 when a tall window stacks it) and scales
as one piece from there, so these hold at any window size:

- **One continuous scale.** Larger windows multiply the whole player and dial menu by `--ui-scale`, from
  1 up to 3, following the window's shape. Nothing jumps at a breakpoint, and opening the menu never
  changes the scale.
- **Readable minimums.** At scale 1, text is at least 12px (small tracked capitals 11.5px) in every
  layout, including narrow and short windows.
- **Hit areas.** Every control offers at least a 24 × 24px target (WCAG 2.2 target size), even in Split
  View where the player is shown at 82%. Hit areas grow with padding and matching negative margins so
  nothing moves.
- **Layouts follow the space they have.** The player stacks in its own narrow column or in a tall
  window, and Split View needs 960px at design size, so a scaled-up window never squeezes the menu.

Check a change with a font and target audit at a few sizes (small, laptop, portrait, 4K at 100%)
before committing.
