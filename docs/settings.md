# Settings

Open Settings from Home. Settings are grouped into six categories, in the order most apps use, and
saved between restarts. Rows marked › open one more screen to pick a value. Values move between
preset stops, so a few dial clicks reach any of them: colours use named swatches (including White, Spotify Green for accents, and Black for backgrounds), percentages move in 5% steps, and timeouts use 3, 5, 8, 10, 15, 20, 30, 45 seconds and on up to
10 minutes.

| Category   | Answers                                                                    |
| ---------- | -------------------------------------------------------------------------- |
| General    | When Now Playing opens, and how turnbit sits on the desktop in either mode |
| Playback   | What plays, on which device, and your Spotify account                      |
| Controls   | How the dial, buttons, and mouse respond                                   |
| Appearance | How the menu and player look                                               |
| Window     | The window's dial menu timeout and background                              |
| Widget     | Widget mode, desktop placement, click through, and its background          |

## General

| Setting                    | What it does                                                                                                                                                                                                                                                         | Default       |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| Now Playing Opens          | **Automatically**: Play on another screen opens Now Playing (without playing or pausing), choosing a song opens it, and turnbit returns to it after 10 seconds without input. **Only When Asked**: Play plays or pauses where you are, and you stay in the song list | Automatically |
| Keep on Top                | Keeps turnbit above other windows                                                                                                                                                                                                                                    | Off           |
| Transparency               | Off, Always, or Idle Fade, with opacity and idle timeout. Window Mode keeps opacity at 20% or above. When it is on, **Dial Only Wake** lets media buttons control playback while turnbit is faded out without waking it; turn or press the dial to wake it           | Off           |
| Pin Dial Menu / Pin Widget | Window Mode: keeps the dial menu open. Widget: pauses idle fading and the switch to Now Playing                                                                                                                                                                      | Off           |
| Gaming Mode                | Pauses decorative animations when you are not using turnbit                                                                                                                                                                                                          | Off           |

These always happen and are no longer settings: a Back row tops every list below Home, Home shows
**Last Song List** once you have browsed one, the list recentres on the playing song when turnbit wakes
from idle, choosing the song that is already playing opens it instead of restarting it, and the Window
dial menu rewinds to the playlist in play.

## Playback

| Setting                    | What it does                                                                                             | Default      |
| -------------------------- | -------------------------------------------------------------------------------------------------------- | ------------ |
| Volume                     | Opens a dedicated volume page                                                                            |              |
| Playback Device            | Moves playback to another Spotify device                                                                 |              |
| Preferred Device           | The device turnbit reconnects to when playback has gone idle                                             | Automatic    |
| When Nothing Is Playing    | What Play starts when Spotify has nothing loaded: Last Session, Liked Songs, a playlist you pick, or Off | Last Session |
| Open Spotify Automatically | Starts the Spotify desktop app if no device is available                                                 | On           |
| Spotify Account            | Connect or disconnect your Spotify account                                                               |              |

## Controls

| Setting                | What it does                                                                                                                                                                         | Default    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| Reverse Dial Direction | Flips the dial's direction                                                                                                                                                           | Off        |
| Dial Double-Press      | Go Back one level, or go Home                                                                                                                                                        | Back       |
| Hover Shortcuts        | Resting for a second on Back, Now Playing (top of Home), or Load more runs it, with a ring showing the countdown                                                                     | On         |
| Mouse Mode Key         | The shortcut for [Keyboard & Mouse Mode](../README.md#keyboard-and-mouse): Ctrl+Alt+Z, Alt+Shift+Space, Ctrl+Alt+Space, F13, or Off. If another app already uses it, turnbit says so | Ctrl+Alt+Z |
| Click Sounds           | Soft clicks while browsing                                                                                                                                                           | Off        |

## Appearance

| Setting                 | What it does                                                                                                            | Default                 |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| Curved Menu             | Lays the menu out along a curve; off shows a straight list                                                              | On                      |
| Screen Edge / Menu Side | The left or right edge for the widget, or the window menu's side. Menu text aligns to the same side                     | Left                    |
| Text Color              | Colour of text and controls in the menu and the window player: White or one of twelve named colours                     | White                   |
| Accent Color            | Colour of the current song, the playing indicator, and controls that are on (shuffle, repeat, Like)                     | Spotify Green (#1DB954) |
| Now Playing Backdrop    | Window Mode: the large Now Playing screen                                                                               | On                      |
| Dial Menu Layout        | Window Mode: Overlay covers the player while you browse; Split View puts the menu beside it (overlay below 960 px wide) | Overlay                 |

## Window

| Setting           | What it does                                                                                                                                                                                                                                                                                                                                      | Default              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| Dial Menu Timeout | Window Mode: seconds without navigation before the dial menu hides and the player returns                                                                                                                                                                                                                                                         | 3 sec                |
| Menu Background › | **Style** (with the Now Playing Backdrop): Matching shares the player's background; Black, Glass, and Cover Color (sampled from the playing cover) give the menu its own panel. **Smoky Background** and **Background Color** set the opacity and colour of the window menu's haze | Matching, 24%, Black |

## Widget

| Setting             | What it does                                                                                                                                | Default                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Widget Mode         | On uses the floating widget; Off uses the regular window                                                                                    | Off                          |
| Size & Position     | Widget only: which display, width (15 to 70% of the screen, never under 400 px), height (30 to 100%), and vertical position, previewed live | Automatic, 35%, 100%, Center |
| Mouse Click Through | Widget only: the mouse passes through the widget to the windows behind it. Navigate with the dial                                           | Off                          |
| Background ›        | **Smoky Background** and **Background Color** for the widget's haze, independent of Window                                                  | 24%, Black                   |

Editing the window's smoke temporarily previews the haze over any existing panel background. Save
selects Matching so the haze remains visible; Cancel restores the previous panel. Existing installs
start both opacity settings at their previous shared value, then save them independently.

## Reset to Defaults

Each category has a reset for its settings. Settings also has a reset for all categories. Both open a
confirmation screen with Cancel selected. Resetting Widget turns Widget Mode off, returning to the
regular window. App-wide settings (Keep on Top, Transparency, Dial Only Wake, pinning, Gaming Mode)
reset from General. Resets keep Spotify authorization, the last song list, music playback, and native
window bounds. Playback reset restores device/recovery preferences; it does not change the current
volume or actively transfer playback. New defaults never overwrite saved preferences automatically.

Settings that were removed keep their old default behavior. If you had turned off both **Idle to Now
Playing** and **Open Song in Now Playing**, Now Playing Opens starts on **Only When Asked**.

When turnbit has faded out with Idle Fade, the first dial turn or press only wakes it. Play, Next, and
Previous work right away.

**Start at Login** lives in the tray or menu bar menu rather than in Settings.
