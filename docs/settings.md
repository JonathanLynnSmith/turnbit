# Settings

Open Settings from Home. Settings are grouped into seven categories, in the order most apps use, and
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
| Extras | Party Mode and audio effects |

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

## Extras

Open **Extras** from Home, or **Settings > Extras**.

| Setting | What it does | Default |
| --- | --- | --- |
| Party Mode | Independently cycles Now Playing text colors. Pauses with playback, hidden views, or Gaming Mode idle. Reduced Motion keeps the colors still. Use Audio Reactive for system-audio-driven colors | Off |
| Party Intensity | Speed and size of audio-driven color changes, or speed of timed color cycles. Zero holds a static palette | 50% |
| Audio Reactive | Windows: drive Party Mode colors from output audio. Enabling also turns Party Mode on and starts capture | Off |
| Audio Source | Follow Spotify's local output, or use the Windows default output. Changing this stops capture until you start again | Spotify Output |
| Audio Capture | Start, cancel, retry, or stop system audio capture; appears when Party Mode and Audio Reactive are on | Stopped |

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


## Party Mode

Under **Home > Extras** (also **Settings > Extras**), Party Mode colors Now Playing text in the window
and widget. With Audio Reactive off, the text cycles through colors over time.
With Audio Reactive on (Windows), bass drives the title, midrange drives the artist
and credits, and treble drives album/duration text; other labels use a combined
level. Each text group moves through the full color wheel as its frequency band
plays, with larger color jumps on sharp rises in energy. Silence lets colors
settle in place. This measures frequency energy, not a precomputed beat grid.

A soft glow behind the album art follows the combined audio color and brightens
with the music. It works in both window and widget views. With Audio Reactive
off, the glow cycles with Party Mode's timed palette. Turning Party Mode off or
stopping audio capture removes it. Pause and Reduced Motion hold it still.

Party audio updates are capped at 15 per second. The halo blends fixed color
layers, and hidden windows use background throttling. For the least background
animation while gaming, enable **Window > Gaming Mode** (or **Widget > Gaming
Mode**); decorative effects pause after 1.5 seconds without Turnbit interaction.

Select **Audio Reactive** to enable it and start capture, using the mouse or dial.
The Audio Capture row shows Starting, Listening, Reconnecting, Ready, or Retry, and
also stops/cancels capture. Ready means capture is open but analysis is paused
while the player is paused, hidden/covered, in Gaming Mode idle, or Reduced Motion
is enabled. Returning to an active Now Playing view resumes analysis.

**Party Intensity** previews live from 0 to 100%. In audio mode it controls the
speed and size of color changes; in timed mode it controls cycle speed. Zero holds the
palette still. Cancel restores the saved intensity.

**Audio Source** defaults to Spotify Output. This follows Spotify's local Windows
output, including a separate Wave Link Music channel, and falls back to the
default output if Spotify has no local session. Default Output follows Windows'
default multimedia output instead. Device changes are checked every two seconds;
lost devices reconnect automatically. Changing the source setting requires a new
explicit start. These choices do not change Windows or Spotify routing.

Audio is the selected output's mix, including other apps and notifications on
that output. It cannot capture a Spotify Connect speaker playing somewhere else.
Analysis uses local Windows WASAPI loopback, without a microphone, screen capture,
recording, playback echo, or upload. Only three frequency levels and an overall
level reach the interface; audio samples remain in memory in the capture helper.

Stop capture in Audio Capture, or switch off Audio Reactive or Party Mode. Capture
also stops when the renderer reloads, the window changes mode, or the app quits.
Saved preferences survive those transitions, but capture does not restart on its
own: select Audio Capture again. If audio mode is selected but capture is stopped,
unavailable, or denied, there is no timed animation pretending to follow the audio.

Turning Party Mode off restores Text Color and Accent Color; saved colors are
never overwritten. Extras and all-settings resets turn both options off.
