# Windows and macOS

turnbit is one codebase and behaves the same on both. Everything that differs is here.

| | Windows | macOS |
| --- | --- | --- |
| Local Spotify control | Play, pause, skip, and seek go straight to Spotify's own media session: instant, and no API calls | Goes through the Spotify Web API, so transport is a round trip and counts against the rate limit |
| Lives in | The system tray. Left-click toggles the widget, right-click opens the menu | The menu bar. Clicking opens the menu; the Dock icon appears only in Window Mode |
| The widget and other desktops | Always on top is enough | turnbit also puts the widget on every Space and above fullscreen apps |
| Ulanzi plugin folder | `%APPDATA%\Ulanzi\UlanziDeck\Plugins` | `~/Library/Application Support/Ulanzi/UlanziDeck/Plugins` |
| Shortcut names | `Alt` is the Alt key | `Alt` is the Option key; the shortcuts are otherwise identical |

`npm run plugin:install` and `npm run studio:restart` handle both, with no arguments. Keeping the
screen awake while the dial is in use, the tray menu, Start at Login, Window Mode, transparency, and
Keyboard & Mouse Mode are the same code on both systems.

## Building a standalone app

Run `npm run package`.

- **Windows:** `turnbit.exe` lands in `dist\win-unpacked`. Keep that whole folder together.
- **macOS:** `turnbit.app` lands in `dist/mac` (or `dist/mac-arm64`).

Builds are unsigned, so both systems warn the first time you open one. On macOS, right-click the app
and choose **Open**.
