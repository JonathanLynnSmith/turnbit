# Settings

Open Settings from Home. Settings are grouped into six categories, in the order most apps use, and
saved between restarts. Rows marked › open one more screen to pick a value. Values move between
preset stops, so a few dial clicks reach any of them: colours use named swatches (including White, Spotify Green for accents, and Black for backgrounds), percentages move in 5% steps, and timeouts use 3, 5, 8, 10, 15, 20, 30, 45 seconds and on up to
10 minutes.

| Category | Answers |
| --- | --- |
| General | What the menus show, and when Now Playing opens |
| Playback | What plays, on which device, and your Spotify account |
| Controls | How the dial, buttons, and mouse respond |
| Appearance | How the menu and player look |
| Window | Window behavior and its menu background |
| Widget | Widget mode, desktop placement, and its background |

## General

| Setting | What it does | Default |
| --- | --- | --- |
| Back in Lists | Shows a Back row at the top of every list below Home | On |
| Last Song List on Home | Shows Last Song List at the top of Home to reopen the list you were browsing | On |
| Play Opens Now Playing | Pressing Play on any other screen opens Now Playing without playing or pausing. Off: Play plays or pauses and you stay put | On |
| Open Song in Now Playing | Choosing a song opens Now Playing | On |
| Idle to Now Playing | Switches to Now Playing after 10 seconds without input | On |
| Follow Playing Song | Recentres the list on the playing song when turnbit wakes from its idle fade (after 10 seconds when idle fading is off) | On |

To stay in the song list instead of switching to Now Playing, turn off **Idle to Now Playing** and
**Open Song in Now Playing**.

## Playback

| Setting | What it does | Default |
| --- | --- | --- |
| Volume | Opens a dedicated volume page | |
| Playback Device | Moves playback to another Spotify device | |
| Preferred Device | The device turnbit reconnects to when playback has gone idle | Automatic |
| When Nothing Is Playing | What Play starts when Spotify has nothing loaded: Last Session, Liked Songs, a playlist you pick, or Off | Last Session |
| Keep Song Position | Selecting the song that is already playing opens Now Playing instead of restarting it | On |
| Open Spotify Automatically | Starts the Spotify desktop app if no device is available | On |
| Spotify Account | Connect or disconnect your Spotify account | |

## Controls

| Setting | What it does | Default |
| --- | --- | --- |
| Reverse Dial Direction | Flips the dial's direction | Off |
| Dial Double-Press | Go Back one level, or go Home | Back |
| Hover Shortcuts | Resting for a second on Back, Now Playing (top of Home), or Load more runs it, with a ring showing the countdown | On |
| Dial Only Wake | While turnbit is faded out, media buttons control playback without waking it; turn or press the dial to wake it | Off |
| Mouse Mode Key | The shortcut for [Keyboard & Mouse Mode](../README.md#keyboard-and-mouse): Ctrl+Alt+Z, Alt+Shift+Space, Ctrl+Alt+Space, F13, or Off. If another app already uses it, turnbit says so | Ctrl+Alt+Z |
| Click Sounds | Soft clicks while browsing | Off |

## Appearance

| Setting | What it does | Default |
| --- | --- | --- |
| Curved Menu | Lays the menu out along a curve; off shows a straight list | On |
| Text Alignment | Aligns menu text: Left, Right, or Auto (toward the docked edge) | Left |
| Screen Edge / Menu Side | The left or right edge for the widget, or the window menu's side | Left |
| Text Color | Colour of text and controls in the menu and the window player: White or one of twelve named colours | White |
| Accent Color | Colour of the current song, the playing indicator, and controls that are on (shuffle, repeat, Like) | Spotify Green (#1DB954) |
| Now Playing Backdrop | Window Mode: the large Now Playing screen | On |
| Dial Menu Layout | Window Mode: Overlay covers the player while you browse; Split View puts the menu beside it (overlay below 960 px wide) | Overlay |
| Dial Menu Background | Window Mode: the look behind the dial menu. Matching shares the player's background; Black, Glass, and Cover Color (sampled from the playing cover) give the menu its own panel | Matching |
| Dial Menu Divider | Window Mode: the hairline between the menu and the player in Split View, with the Matching background | Off |

## Window

| Setting | What it does | Default |
| --- | --- | --- |
| Keep on Top | Keeps turnbit above other windows | Off |
| Transparency | Off, Always, or Idle Fade, with opacity and idle timeout. Window Mode keeps opacity at 20% or above | Off |
| Pin Dial Menu | Keeps the dial menu open in the window player | Off |
| Dial Menu Timeout | Window Mode: seconds without navigation before the dial menu hides and the player returns | 3 sec |
| Dial Menu Returns to Playlist | Window Mode: the dial menu rewinds to the list the playing song was chosen from, so the next press starts there. On the timeout the switch plays on screen before the menu goes. Off: the menu reopens wherever you left it | On |
| Gaming Mode | Pauses decorative animations when you are not using turnbit | Off |
| Smoky Background | Opacity of the window menu's haze | 24% |
| Background Color | Color of the window menu's haze | Black |

## Widget

| Setting | What it does | Default |
| --- | --- | --- |
| Widget Mode | On uses the floating widget; Off uses the regular window | Off |
| Size & Position | Widget only: which display, width (15 to 70% of the screen, never under 400 px), height (30 to 100%), and vertical position, previewed live | Automatic, 35%, 100%, Center |
| Mouse Click Through | Widget only: the mouse passes through the widget to the windows behind it. Navigate with the dial | Off |
| Pin Widget | Pauses idle fading and the switch to Now Playing | Off |
| Keep on Top | Same app-wide setting as Window | Off |
| Transparency | Same app-wide setting as Window | Off |
| Gaming Mode | Same app-wide setting as Window | Off |
| Smoky Background | Opacity of the widget's haze, independent of Window | 24% |
| Background Color | Color of the widget's haze, independent of Window | Black |

Editing the window's smoke temporarily previews the haze over any existing panel background. Save
selects Matching so the haze remains visible; Cancel restores the previous panel. Existing installs
start both opacity settings at their previous shared value, then save them independently.

## Reset to Defaults

Each category has a reset for its settings. Settings also has a reset for all categories. Both open a
confirmation screen with Cancel selected. Resetting Widget turns Widget Mode off, returning to the
regular window. Shared settings (Keep on Top, Transparency, pinning, Gaming Mode) reset from either
Window or Widget. Resets keep Spotify authorization, the last song list, music playback, and native
window bounds. Playback reset restores device/recovery preferences; it does not change the current
volume or actively transfer playback. New defaults never overwrite saved preferences automatically.

When turnbit has faded out with Idle Fade, the first dial turn or press only wakes it. Play, Next, and
Previous work right away.

**Start at Login** lives in the tray or menu bar menu rather than in Settings.
