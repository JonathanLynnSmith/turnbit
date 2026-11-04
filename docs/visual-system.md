# Turnbit visual system

Turnbit is a music controller with two presentations: a regular player window and
a floating desktop widget. Both use the same typography, colors, controls, and
missing-artwork treatment. The curved browser remains its main navigation pattern.
Album artwork and song information lead; interface decoration stays secondary.

## Source and ownership

`renderer/tokens.css` loads before `styles.css`, `radial.css`, and `polish.css`.
It owns shared values. Base elements and the connection dialog live in
`styles.css`; player and browser geometry live in `radial.css`; desktop feedback
and compact widget adjustments live in `polish.css`.

Use an existing token before introducing a literal. Keep one-off geometry,
responsive clamps, carousel offsets, and progress percentages with their feature.
Do not turn every number into a token. Add a shared role when multiple surfaces
need the same decision, and update this document with that role.

## Type and spacing

| Role | Token | Value / use |
| --- | --- | --- |
| Interface | `--tb-font-ui` | Native system UI; Segoe UI Variable Text on Windows |
| Display | `--tb-font-display` | Native display face; Segoe UI Variable Display on Windows |
| Caption | `--tb-type-caption` | 12px labels, timestamps, secondary controls |
| Body | `--tb-type-body` | 14px copy, inputs, credits |
| Browser row | `--tb-type-menu` | 24px, 22px in compact widgets |
| Widget title | `--tb-type-title` | 27px, responsive compact overrides |
| Window title | `--tb-type-hero` | 30–64px; responsive column overrides |
| Weight | `--tb-weight-*` | 400 text, 500 controls, 600 selection, 700 title |
| Spacing | `--tb-space-1` through `7` | 4, 8, 12, 16, 24, 32, 48px |

Spacing tokens apply to related groups, fields, actions, and surface padding.
Do not add oversized display text to settings or explanatory copy to self-evident
controls. Use actual labels, not slogans. Metadata is truncated or wrapped by its
role; full values remain available on hover. Keep title descenders clear of clips.

## Color and surfaces

| Role | Token | Default |
| --- | --- | --- |
| Window base | `--tb-canvas` | `#101214` |
| Dialog / notice / placeholder | `--tb-surface` | `#1B1F21` |
| Primary control | `--tb-surface-raised` | `#22272A` |
| Hover surface | `--tb-surface-hover` | `#2A3033` |
| Neutral text | `--tb-ink` | `#EEF7F5` |
| Default accent | `--tb-accent-default` | Spotify Green `#1DB954` |
| Live text and accent | `--tb-text`, `--tb-accent` | Resolve the user's saved colors and previews |
| Secondary text | `--tb-text-secondary`, `--tb-text-muted` | 72% and 58% of live text |
| Edges | `--tb-border`, `--tb-border-strong` | Subtle neutral hairlines |

Use accent for the current song, playback state, enabled controls, and focus.
Primary Save/Connect actions use a neutral solid surface; changing the accent
must not make a picker hard to operate. Dialogs and notices share a solid surface,
typeface, spacing scale, and shadow. Notices do not need frosted glass.

`--tb-radius-small` is 4px, control/cover radii are 8px, dialogs are 16px, and
circular controls use `--tb-radius-round`. Surface and cover shadows have separate
tokens. The short dark text shadow protects widget labels against the desktop;
selection does not add colored bloom or animate font weight.

## Artwork and effects

The cover image is displayed intact. Missing **or failed** covers show a flat
Turnbit sleeve: the existing brand symbol on `--tb-surface`, with a small wordmark
on larger covers. The same component serves the window, widget, and browsing row.
`renderer/assets/turnbit-mark.svg` reuses the existing logo path; its view box
includes the full symbol. Do not substitute a music note, generic gradient, or
generated album cover. A later valid cover restores the image.

Effects have specific jobs:

- One restrained artwork-color wash gives the current album context; it disappears
  without artwork. Its strength is `--tb-artwork-wash-opacity` (0.22).
- The smoky gradient protects labels over the desktop and feathers the edge of
  the menu. Window and Widget retain independent user-controlled opacity/colors.
- A progress gradient shows completed versus remaining playback.
- Glass is an explicit Dial Menu Background preference, not a general surface
  style. Reduced Transparency replaces it with a solid surface. Cover Color uses
  a flat sampled tint. Play, notices, and the fallback sleeve remain solid.

## Icons and motion

Use the existing line-icon family for menu/navigation controls, with
`--tb-icon-size` (16px) and `--tb-icon-stroke` (1.8) for shared controls. Menu icons
scale with their label. Filled transport symbols remain filled; Spotify's supplied
logo and save-control assets remain unchanged. Decorative marks are hidden from
assistive technology; interactive controls keep explicit accessible names.

| Role | Token | Duration |
| --- | --- | --- |
| Pointer / keyboard feedback | `--tb-duration-feedback` | 120ms |
| Local control state | `--tb-duration-state` | 180ms |
| View transition | `--tb-duration-view` | 260ms |
| Widget track crossfade | `--tb-duration-track` | 360ms |
| Window metadata out / in | `--tb-duration-track-out`, `--tb-duration-track-in` | 200 / 560ms |

Use `--tb-ease` for view movement. Motion communicates selection, navigation, or a
song change; do not add idle movement for decoration. Reduced Motion removes
spatial movement and repeating animation while retaining brief color/opacity
feedback. Playing bars hold still. Existing Gaming Mode still pauses idle effects.

## Review and checks

`scripts/verify-visual-system.js` checks shared type/surface/spacing behavior,
missing and failed covers, recovery to valid artwork, both widget edges, and
reduced motion/transparency in real Electron windows. It captures the window,
browser, narrow layout, connection dialog, notice, and widget.

Review uses real song/artist/album text in offline fixtures, including long credit
and version strings. Optional `TURNBIT_REVIEW_ART` points at a local album image
for the artwork pass; the image stays in ignored `artifacts/` and is not shipped.
These are rendering checks, not live Spotify playback or physical-dial tests.

Also run `npm run check`, `npm run smoke`, `npm run test:desktop`, and
`scripts/verify-polish.js` when shared styles change. Inspect the screenshots;
passing assertions alone do not establish visual quality.
