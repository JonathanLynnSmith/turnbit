# Windows and macOS

turnbit is one codebase and behaves the same on both. Everything that differs is here.

| | Windows | macOS |
| --- | --- | --- |
| Local Spotify control | Play, pause, skip, and seek go straight to Spotify's own media session: instant, and no API calls | The same, through the Spotify app's AppleScript controls. The first time, macOS asks to let turnbit control Spotify; if you decline, transport uses the Web API (a round trip that counts against the rate limit). Change it later in System Settings > Privacy & Security > Automation |
| Lives in | The system tray. Left-click toggles the widget, right-click opens the menu | The menu bar. Clicking opens the menu; the Dock icon appears only in Window Mode |
| The widget and other desktops | Always on top is enough | turnbit also puts the widget on every Space and above fullscreen apps |
| Ulanzi plugin folder | `%APPDATA%\Ulanzi\UlanziDeck\Plugins` | `~/Library/Application Support/Ulanzi/UlanziDeck/Plugins` |
| Shortcut names | `Alt` is the Alt key | `Alt` is the Option key; the shortcuts are otherwise identical |

`npm run plugin:install` and `npm run studio:restart` handle both, with no arguments. Keeping the
screen awake while the dial is in use, the tray menu, Start at Login, Window Mode, transparency, and
Keyboard & Mouse Mode are the same code on both systems.

## Building a standalone app

Run `npm run dist` to build an installer for the system you are on.

- **Windows:** `dist	urnbit-<version>-win-x64.exe`, an installer that lets you pick the folder and adds
  Start menu and uninstall entries.
- **macOS:** `dist/turnbit-<version>-mac-<arch>.dmg`. Open it and drag turnbit to Applications.

`npm run package` skips the installer and leaves the app itself in `dist\win-unpacked` (keep that whole
folder together) or `dist/mac` (`dist/mac-arm64` on Apple silicon).

Builds are unsigned, so both systems warn the first time you open one. On Windows, choose **More info**
then **Run anyway**. On macOS, right-click the app and choose **Open**.

Pushing a version tag such as `v0.3.0` runs `.github/workflows/release.yml`, which builds both installers
and attaches them to a draft GitHub release. Nothing is public until you publish the draft.

An installed build keeps its settings and Spotify session in a `turnbit` profile folder. A machine that
ran turnbit from source before it was renamed keeps using its existing `desktop-ulanzi-ipod-poc` folder,
so nothing is lost.
