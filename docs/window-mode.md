# Window Mode

By default turnbit is an ordinary window: it has a title bar, a taskbar or Dock icon, native minimize
and full screen, and it remembers its size and position. Turn off **Settings > Window > Window Mode** to
use the alternative, a floating, transparent widget docked to the edge of your screen. The choice is
saved, so an existing install keeps the mode it was last switched to.

## The window player

With **Now Playing Backdrop** on (the default), the window opens on a large Now Playing screen:
album art, the track, and play/pause, previous/next, like, shuffle, repeat, seek, and volume.
Everything on it works with the mouse. Hardware playback buttons work whether or not the menu is up.
The header keeps Browse on the left, the current view breadcrumb in the center, and the Spotify logo
on the right. When connected, the logo opens the current song in Spotify. While browsing, it
opens the selected song or playlist when available. The floating widget has the same link.
An accent-colored pin beside Browse shows when the dial menu is pinned.
These links use the installed Spotify desktop app on Windows or macOS when its URI handler is available;
otherwise they open Spotify's download page.
Browsing fetches songs and playlists in batches of 20. Rest on **Load more** or press it to append
the next batch beneath the items already in the dial menu.

Turn the dial, press it, click **Browse**, press Up/Down, or scroll to bring in the dial menu. An
opening press only opens the menu; the next press selects. After **Dial Menu Timeout** (8 seconds by
default, 1 to 600) without navigation, the menu goes away again and Now Playing returns, keeping your
page and selection for next time. Selecting a song, choosing **Now Playing**, or clicking the empty
browsing area also returns to the player. **Pin Dial Menu** keeps the menu open; value and colour
pickers stay open while you edit them.

**Dial Menu Returns to Playlist** rewinds the menu to the list the playing song was chosen from and
highlights that song, so wandering into Playlists or Settings does not cost you your place: the next
press reopens the music you are listening to. On the timeout the rewind is something to watch. The same
**Dial Menu Timeout** decides when it starts, so at 3 seconds nothing moves for 3 seconds; then the
song list flows in while the menu is still up, and the menu goes once the switch has been seen.
Turning the dial or pressing during that moment keeps the menu open on the list it rewound to.
A close you ask for — **Now Playing**, the empty browsing area, or choosing a song — puts the player
back at once and rewinds behind the fade, where there is nothing to watch. Turn the setting off to
reopen the menu exactly where you left it. Until a song has been chosen from a list there is nothing to
return to, and the menu keeps its page either way.

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

The player fits any window size. Cover, song info, and controls stay together as one group centred in
the window. A window clearly taller than it is wide stacks the cover above the song. On a large display
the player and dial menu scale up together with the window: normal size at about 1440 × 880 (720 × 1000
when stacked), growing to at most three times that, so a big or 4K screen is filled rather than left
mostly empty. Split View needs the window to be at least 960 px wide before that scaling, so a tall
window keeps the overlay.

Split View needs room for both, so a window narrower than 960 px uses the overlay until you widen it.
When the player's own column is narrower than 640 px it stacks the artwork above the song info.

**Dial Menu Background** sets the look behind the menu. **Matching** (the default) shares the player's
background, so both views read as one surface. The others give the menu its own panel on its side
that comes and goes with it: **Black** is solid and casts a shadow across the player, **Glass** is a
lighter frosted pane, and **Cover Color** tints the panel with a colour sampled from the playing
song's cover. In Split View the panel's edge is the seam, so the divider is only offered with Matching.

## Look and feel

- An ambient glow uses a colour sampled from the playing cover and fades to nothing before any window
  edge. The cover image itself stays unaltered and the glow disappears when nothing is playing.
- **Transparency** applies to the window too, but never below 20%, so the title bar stays visible
  enough to grab. **Mouse Click Through** is a widget-only setting and is hidden here.
- Reduced-motion settings switch between views without animation.
