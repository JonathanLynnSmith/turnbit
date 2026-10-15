# Floating Radial visual direction

Keep the reversed, mirrored half-oval label carousel, spanning the monitor work area vertically and transparent desktop presentation. Changes should refine the existing hierarchy rather than add panels, wedges or a drawn wheel.

Reference review:
- [Beosound 5](https://www.blessthisstuff.com/stuff/technology/home-audio/beosound-5-by-bang-olufsen/): curved navigation, restrained hierarchy and album-art emphasis.
- [Circular UI by Christian Cornwell](https://dribbble.com/shots/3431835-Circular-UI): a single clear active selection. Segment backgrounds and orange accents do not suit this widget.

Polish decisions:
- Use independent horizontal and vertical radii: a shallow inward bow and a tall path returning toward the edge at top and bottom.
- Align context and status to the inward edge, matching the carousel and playback panel.
- Interpolate label weight with its distance from the center; retain the circular motion and soft fade.
- Frame artwork with a fine edge and diffuse elevation; retain a transparent panel with a quiet wash.
- Reset inherited iPod slider borders so radial controls render as single thin tracks.
- Use short directional entry and artwork reveal transitions, respecting reduced motion.
- Preserve D100H mappings, Spotify behavior, menu structure and saved preferences.

Reference images are in artifacts for local review only and are excluded from the packaged app.

## Broad smoky scrim

[Scrim overlay examples](https://ux.stackexchange.com/questions/75094/readability-of-overlaid-text-on-images) informed a broad text-protection region followed by a gradual feather. Keep the carousel at 520px while the transparent native surface extends to 1040px where the monitor permits. The elliptical gradient holds full chosen strength beyond the text, then eases through multiple alpha stops to zero. Opacity still uses the existing Smoky Background setting; 0 disables it. The native verification samples alpha beyond the text to detect premature fading or window clipping.
