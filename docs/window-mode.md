# Window Mode

By default turnbit is an ordinary window: it has a title bar, a taskbar or Dock icon, native minimize
and full screen, and it remembers its size and position. Turn off **Settings > Window > Window Mode** to
use the alternative, a floating, transparent widget docked to the edge of your screen. The choice is
saved, so an existing install keeps the mode it was last switched to.

## The window player

With **Now Playing Backdrop** on (the default), the window opens on a large Now Playing screen:
album art, the track, and play/pause, previous/next, like, shuffle, repeat, seek, and volume.
Everything on it works with the mouse. Hardware playback buttons work whether or not the menu is up.

Turn the dial, press it, click **Browse**, press Up/Down, or scroll to bring in the dial menu. An
opening press only opens the menu; the next press selects. After **Dial Menu Timeout** (8 seconds by
default, 1 to 600) without navigation, the menu goes away again and Now Playing returns, keeping your
page and selection for next time. Selecting a song, choosing **Now Playing**, or clicking the empty
browsing area also returns to the player. **Pin Dial Menu** keeps the menu open; value and colour
pickers stay open while you edit them.

## Overlay and Split View

**Dial Menu Layout** chooses how the menu shares the window.

- **Overlay** (the default) shows one view at a time. The player fades out while you browse and fades
  back when the menu goes.
- **Split View** keeps both live. The menu takes a third of the window on the side **Screen Edge**
  docks it to, and the player steps back, slightly smaller, into the rest. You can browse with the
  dial and still use the player's controls with the mouse. When the menu times out, the player glides
  back to the centre of the whole window.

In Split View the space beside the menu is spaced evenly: the gap from the menu's highlighted row to
the divider, from the divider to the player, and from the player to the window's edge are all the
same, so the divider always sits midway between the menu and the player. **Dial Menu Divider** turns
the hairline off. The player's artwork and song info move as one unit and stay centred over the
playback controls whatever the title's length.

Split View needs room for both, so a window narrower than 960 px uses the overlay until you widen it.
When the player's own column is narrower than 640 px it stacks the artwork above the song info.

**Dial Menu Background** sets the look behind the menu. **Matching** (the default) shares the player's
background, so both views read as one surface. The others give the menu its own panel on its side
that comes and goes with it: **Black** is solid and casts a shadow across the player, **Glass** is a
lighter frosted pane, and **Artwork** fills the panel with the playing song's cover, blurred to its
colours. In Split View the panel's edge is the seam, so the divider is only offered with Matching.

## Look and feel

- An ambient glow, tinted by the playing artwork, sits behind the middle of the menu and washes out
  across the window, fading to nothing before any edge. It is the cover itself, blurred to little
  more than its average colour, so it follows the song and disappears when nothing is playing.
- **Transparency** applies to the window too, but never below 20%, so the title bar stays visible
  enough to grab. **Mouse Click Through** is a widget-only setting and is hidden here.
- Reduced-motion settings switch between views without animation.
