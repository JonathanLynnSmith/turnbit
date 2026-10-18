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
and the iPod and Zune modes remain available.

Validation: `npm run check` and `electron scripts/verify-polish.js`.
The latter uses isolated demo data and captures both edges under `artifacts/`;
it checks compact playback, pointer-driven movement and proportional resizing,
cancel behavior, and saved bounds. `electron scripts/verify-layout.js` checks
the existing Size & Position settings independently.
