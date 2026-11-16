# Settings

Open Settings from Home. While a setting is highlighted, one line at the foot of the menu says what
it does. Rows marked › open one more screen to pick a value. Values move between preset stops, so a
few dial clicks reach any of them: colours use named swatches (including White, Spotify Green for
accents, and Black for backgrounds), percentages move in 5% steps, and timeouts use 3, 5, 8, 10, 15,
20, 30, 45 seconds and on up to 10 minutes.

Settings opens with:

| Row | What it is |
| --- | --- |
| Display | **Window** (an ordinary window) or **Widget** (floats at your screen's edge) |
| Spotify Account | Connect or disconnect; shows Connected or Not connected |
| General | When Now Playing opens, visibility, and startup |
| Playback | What plays, and on which device |
| Controls | How the dial, buttons, and mouse respond |
| Appearance | Layout, colours, and background |
| Reset to Defaults | One place to reset everything or a single part |

A setting that only applies to the window or to the widget is listed only while that display is in
use. Those are marked **Window** or **Widget** below.

## General

| Setting | What it does | Default |
| --- | --- | --- |
| Now Playing Opens | **Automatically**: Play on another screen opens Now Playing (without playing or pausing), choosing a song opens it, and turnbit returns to it after 10 seconds without input. **Only When Asked**: Play plays or pauses where you are, and you stay in the song list | Automatically |
| Keep on Top | Keeps turnbit above other windows | Off |
| Transparency › | Off, Always, or Idle Fade, with opacity and idle timeout; the row shows the current mode. Window keeps opacity at 20% or above. When it is on, **Stay Hidden for Media Buttons** lets media buttons control playback while turnbit is faded out without waking it; turn or press the dial to wake it | Off |
| Keep Menu Open / Stay Visible | **Window**: keeps the menu open. **Widget**: pauses idle fading and the switch to Now Playing | Off |
| Pause Animations When Idle | Pauses decorative animations when you are not using turnbit | Off |
| Start at Login | Opens turnbit when you sign in. Also in the tray or menu bar menu | Off |
| Menu Timeout › | **Window**: seconds without navigation before the menu hides and the player returns | 3 sec |
| Mouse Click Through | **Widget**: the mouse passes through the widget to the windows behind it. Navigate with the dial | Off |

These always happen and are no longer settings: a Back row tops every list below Home, Home shows
**Last Song List** once you have browsed one, the list recentres on the playing song when turnbit wakes
from idle, choosing the song that is already playing opens it instead of restarting it, and the Window
dial menu rewinds to the playlist in play.

## Playback

| Setting | What it does | Default |
| --- | --- | --- |
| What Play Starts › | What Play starts when Spotify has nothing loaded: Last Session, Liked Songs, a playlist you pick, or Off | Last Session |
| Preferred Device › | The device turnbit reconnects to when playback has gone idle | Automatic |
| Open Spotify Automatically | Starts the Spotify desktop app if no device is available | On |
| Playback Device › | Moves playback to another Spotify device | |
| Volume › | Opens a dedicated volume page | |

## Controls

| Setting | What it does | Default |
| --- | --- | --- |
| Reverse Dial Direction | Flips the dial's direction | Off |
| Dial Double-Press | Go Back one level, or go Home | Back |
| Rest to Activate | Resting for a second on Back, Now Playing (top of Home), or Load more runs it, with a ring showing the countdown | On |
| Mouse Mode Shortcut | The shortcut for [Keyboard & Mouse Mode](../README.md#keyboard-and-mouse): Ctrl+Alt+Z, Alt+Shift+Space, Ctrl+Alt+Space, F13, or Off. If another app already uses it, turnbit says so | Ctrl+Alt+Z |
| Click Sounds | Soft clicks while browsing | Off |

## Appearance

| Setting | What it does | Default |
| --- | --- | --- |
| Curved Menu | Lays the menu out along a curve; off shows a straight list | On |
| Menu Side / Screen Edge | The window menu's side, or the screen edge for the widget. Menu text aligns to the same side | Left |
| Text Color › | Colour of text and controls in the menu and the window player: White or one of twelve named colours | White |
| Accent Color › | Colour of the current song, the playing indicator, and controls that are on (shuffle, repeat, Like) | Spotify Green (#1DB954) |
| Large Now Playing Screen | **Window**: the large Now Playing screen | On |
| Menu Layout | **Window**: Overlay covers the player while you browse; Split View puts the menu beside it (overlay below 960 px wide) | Overlay |
| Menu Background › | **Window**: **Style** (with the large Now Playing screen): Matching shares the player's background; Black, Glass, and Cover Color (sampled from the playing cover) give the menu its own panel. **Background Darkness** and **Background Color** set the haze | Matching, 24%, Black |
| Size & Position › | **Widget**: which display, width (15 to 70% of the screen, never under 400 px), height (30 to 100%), and vertical position, previewed live | Automatic, 35%, 100%, Center |
| Background › | **Widget**: **Background Darkness** and **Background Color** for the widget's haze, independent of the window's | 24%, Black |

Editing the window's smoke temporarily previews the haze over any existing panel background. Save
selects Matching so the haze remains visible; Cancel restores the previous panel. Existing installs
start both opacity settings at their previous shared value, then save them independently.

## Reset to Defaults

**Reset to Defaults** on Settings lists what can be reset: Everything, each of the four categories,
and the Window and Widget looks separately. Each opens a confirmation screen with Cancel selected,
then returns to Settings. Resetting Widget switches Display back to Window. App-wide settings (Keep on Top, Transparency, Stay Hidden for Media Buttons, pinning, Pause Animations
When Idle)
reset from General. Resets keep Spotify authorization, the last song list, music playback, and native
window bounds. Playback reset restores device/recovery preferences; it does not change the current
volume or actively transfer playback. New defaults never overwrite saved preferences automatically.

Settings that were removed keep their old default behavior. If you had turned off both **Idle to Now
Playing** and **Open Song in Now Playing**, Now Playing Opens starts on **Only When Asked**.

When turnbit has faded out with Idle Fade, the first dial turn or press only wakes it. Play, Next, and
Previous work right away.

**Start at Login** is in General and in the tray or menu bar menu; both change the same setting.
