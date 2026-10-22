<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/branding/turnbit-logo-white-tm.svg">
  <source media="(prefers-color-scheme: light)" srcset="assets/branding/turnbit-logo-black-tm.svg">
  <img src="assets/branding/turnbit-logo-black-tm.svg" alt="turnbit" width="360">
</picture>

**A Spotify controller for your desktop, driven by a rotary dial.**

Turn the Ulanzi D100H dial to browse your playlists and songs, press to play, and keep album art and
playback controls one turn away. Your music keeps playing in Spotify; turnbit is the remote.

<img src="assets/demo/turnbit-demo.gif" alt="turnbit in Window Mode: turning the dial slides the curved menu in beside Now Playing, picking a song plays it, and the large player returns with the new artwork" width="720">

## Features

- **Curved dial menu** for Liked Songs, Playlists, and the list you were last browsing
- **Large Now Playing screen** with album art, seek, volume, like, shuffle, and repeat, tinted by a
  soft glow from the cover
- **Split View**: the menu slides in beside the player, so browsing never hides what's playing
- **Two ways to run it**: a transparent widget docked to your screen edge, or an ordinary window
- **Works in the background**: the dial and its buttons control Spotify even when turnbit isn't focused
- **Spotify only**: play, pause, and skip never land on a YouTube video or another app by mistake
- **Picks up where you left off**: reconnects to your preferred Spotify device after playback goes idle
- **No dial? No problem**: use the keyboard, or hold a shortcut to drive it with the mouse

## Requirements

- Windows 10 or 11, or macOS 11 or newer ([what differs](docs/platforms.md))
- [Node.js](https://nodejs.org/) 20 or newer
- Spotify Premium and the Spotify app (desktop, phone, or any Spotify Connect device)
- A free [Spotify developer app](https://developer.spotify.com/dashboard) (setup below)
- Optional: an Ulanzi D100H with [Ulanzi Studio](https://www.ulanzi.com/pages/ulanzi-app)

Without Spotify connected, turnbit runs in a silent demo mode.

## Quick start

```bash
git clone https://github.com/JonathanLynnSmith/turnbit.git
cd turnbit
npm install
npm start
```

turnbit lives in the system tray (Windows) or menu bar (macOS). Closing it hides it there; click the
icon to bring it back, and use its menu to quit. To build a standalone app, see
[Building a standalone app](docs/platforms.md#building-a-standalone-app).

Next, [connect Spotify](#connect-spotify) and, if you have one, [set up the D100H](#set-up-the-ulanzi-d100h).

## Connect Spotify

1. In the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard), create an app and select **Web API**.
2. Add this redirect URI exactly: `http://127.0.0.1:43821/callback`
3. Under **User Management**, add the Spotify account you will use.
4. In turnbit, open **Settings > Playback > Spotify Account**, paste your app's **Client ID**, and select **Connect Spotify**.
5. Approve access in your browser, then start a song in Spotify.

> [!NOTE]
> Spotify development-mode apps are limited to a few authorized users. See [Spotify quota modes](https://developer.spotify.com/documentation/web-api/concepts/quota-modes).

## Set up the Ulanzi D100H

Install the turnbit plugin into Ulanzi Studio, then restart Studio's background process so it loads:

```bash
npm run plugin:build
npm run plugin:install
npm run studio:restart
```

Pair the D100H in Ulanzi Studio and keep Studio running. Then assign the plugin's actions, or import
the ready-made profile in the `ulanzi-plugin` folder, which also maps the side buttons to volume and seek.

| Control | Action |
| --- | --- |
| Dial | Navigation Wheel |
| Top left button | Previous Track |
| Top middle button | Play / Pause |
| Top right button | Next Track |
| Left side, upper button | Menu / Back |

Spare buttons can take **Like Current Song**, **Shuffle**, **Repeat**, **Pin Widget**, **Volume Up/Down**,
or **Seek Back/Forward 10s**. If Ulanzi Studio uses a custom data folder, install with
`npm run plugin:install -- "your path"`.

## Using turnbit

### The dial

| Input | What it does |
| --- | --- |
| Turn | Move through the menu. On Now Playing, change the volume |
| Press | Select |
| Double-press | Go back one level (or Home, with **Dial Double-Press** set to Home) |
| Menu / Back | Go back. From Now Playing, go Home |
| Play / Pause | Pause or resume. From a menu, the first press opens Now Playing |
| Previous / Next | Tap to skip. Hold to rewind or fast-forward |

Every list starts with a **Back** row, so the dial alone gets you everywhere. Rest on **Back**,
**Now Playing** (top of Home), or **Load more** (end of a long list) for a second and it runs on its own.

### Window Mode

turnbit opens as a regular window with a large Now Playing screen. Turning the dial brings in the menu; it goes away again after a few seconds without navigation.
Choose **Dial Menu Layout > Split View** to keep the player on screen beside the menu, as in the GIF
above. Prefer a transparent widget docked to your screen edge? Turn off **Settings > Window > Window
Mode**. Details: [Window Mode](docs/window-mode.md).

### Keyboard and mouse

With turnbit focused: **Up/Down** to move (or change volume on Now Playing), **Enter** to select,
**Esc** or **Backspace** to go back, **Space** for Now Playing then play/pause, **Left/Right** to skip,
and **Shift + Left/Right** to seek 10 seconds.

No dial nearby? Hold **Ctrl + Alt + Z** anywhere: scroll to move, left-click to select, right-click to
go back, middle-click to play or pause. Tap the shortcut instead of holding it to leave the mode on;
tap again or press **Esc** to turn it off. You can change the shortcut in **Settings > Controls > Mouse Mode Key**.

If turnbit is fully transparent and you lose track of it, press **Ctrl + Alt + Shift + D**.

### Settings

turnbit saves every setting between restarts. A few worth knowing about:

- **Preferred Device** and **When Nothing Is Playing** decide where music plays and what Play starts
- **Screen Edge**, **Curved Menu**, and the colour settings change how the menu looks
- **Transparency** and **Gaming Mode** keep the widget out of the way while you work or play

See [all settings](docs/settings.md).

## Troubleshooting

| Problem | Try this |
| --- | --- |
| "No Spotify device is available" | Start a song in Spotify, choose a Preferred Device, or turn on Open Spotify Automatically. A phone or speaker must be on and online; turnbit cannot wake it |
| Music starts on the wrong device | Set **Settings > Playback > Preferred Device** to pin it to one |
| "Nothing was playing" | Play had nothing to start. Pick a source in **Settings > Playback > When Nothing Is Playing** |
| "Retry loading" on Liked Songs | Spotify may be rate-limiting your library. The message shows when it will clear |
| A playlist's songs will not load | Spotify only lists songs in playlists you own or collaborate on. **Play this playlist** still works |
| The D100H does nothing | Make sure Ulanzi Studio is running and the device is paired, then run `npm run studio:restart` |
| Like asks for permission | Reconnect in **Settings > Playback > Spotify Account** to grant the newer permissions |

For more, see [How turnbit works](docs/how-it-works.md), including how to log every Spotify call.

## Development

| Command | What it does |
| --- | --- |
| `npm start` | Run turnbit |
| `npm run check` | ESLint (with dependency rules) and the unit tests |
| `npm run smoke` | Offline end-to-end run through the real app and a simulated dial |
| `npm run test:desktop` | Window Mode and the Now Playing screen in real Electron windows |
| `npm run test:playback` | Playback services and hardware commands with a simulated Spotify |
| `npm run format:check` | Check source formatting |
| `npm run package` | Build the standalone app |
| `npm run demo:gif` | Rebuild the README GIF from a scripted demo-mode run |

Tests simulate Spotify and the dial and use their own sessions and ports, so they can run while
turnbit is open. See [Architecture](docs/architecture.md) for how the code is organised.

The iPod and Zune interfaces are archived on
[archive/ipod-zune-interfaces](https://github.com/JonathanLynnSmith/turnbit/tree/archive/ipod-zune-interfaces).

## License

The turnbit software is released under the [MIT License](LICENSE).

**turnbit™** is a trademark. The MIT License does not grant rights to the turnbit name or logo. The
bundled Ulanzi SDK keeps its Apache 2.0 license (`libs/LICENSE` and `libs/NOTICE.md` in the plugin
folder), and other third-party components keep their own licenses.
