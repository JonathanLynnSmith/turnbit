<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/branding/turnbit-logo-white-tm.svg">
  <source media="(prefers-color-scheme: light)" srcset="assets/branding/turnbit-logo-black-tm.svg">
  <img src="assets/branding/turnbit-logo-black-tm.svg" alt="turnbit" width="360">
</picture>

# turnbit

Previously developed as DialPod.

**turnbit™** is a trademark. This project's software is licensed under the [MIT License](LICENSE). The software license does not grant rights to the turnbit name or logo. Third-party components retain their respective licenses.

A Spotify desktop widget for Windows, controlled by the Ulanzi D100H rotary dial and macro buttons. Built with Electron, DialPod offers iPod Classic, Zune, and Floating Radial interfaces, with artwork, track information, playback progress, and volume controls.

The app controls an existing Spotify player through the Web API. Audio plays in Spotify on your chosen device. Demo mode simulates playback without producing audio.

## Quick guide

- [Launch the app](#launch)
- [Connect Spotify](#connect-spotify)
- [Install and map the D100H plugin](#ulanzi-d100h)
- [Build and verify](#verification-and-build)
- [Interfaces and appearance](#interfaces-and-appearance)
- [Transparency and idle behavior](#transparency-and-idle-behavior)
- [Floating Radial settings](#floating-radial)

## Launch

```powershell
cd C:\Users\jonat\Github\desktop-ulanzi-ipod-poc
npm install
npm start
```

Or run `dist\win-unpacked\DialPod.exe` after `npm run package`. Keep the entire `win-unpacked` folder together. This is a local, unsigned build.

DialPod opens to a classic list menu. Scroll over the wheel to move the highlight and press the center button to select. MENU goes back one level and preserves the selected row. Browse Music → Playlists → playlist → song, Music → Songs, Now Playing, or Settings. Selecting a song starts it; selecting a playlist opens its songs, with a Play this playlist option at the top. Songs lists your Spotify Liked Songs. Longer lists have a Load more entry. Unavailable/local items are shown disabled.

A small ▶ beside a song identifies the current playing track; Ⅱ identifies the current track while paused. This marker is independent of the blue navigation highlight and updates as playback changes, without moving your selection or scroll position.

Settings → Keep Song Position defaults to On. With it enabled, selecting the current song opens Now Playing without restarting it or changing its paused/playing state. Switch it Off to make selecting the current song restart playback. The choice is saved across app restarts. Other songs and the Play this playlist command still start playback normally.

The Play/Pause button (D100H top key, onscreen bottom button, or Space shortcut) opens Now Playing when you are on another screen, without changing playback. Press it again on Now Playing to pause/resume. This also closes the Spotify connection form if it is open; typing Space in a form remains normal text entry. Previous/next skip tracks independently of the current menu. On Now Playing, turning the wheel adjusts volume and stays on that screen. Press Center to return to the song list used for playback, retaining its highlighted row. Press MENU from Now Playing to go straight to Home; MENU elsewhere goes back one level. The playback list is remembered even after visiting Home or Settings. Select Settings → Volume for a dedicated volume page. The diamond in the title bar pins the widget; drag the title bar to move it.

The classic LCD includes an artwork preview on the main/Music menus, list-position counts, scrolling long selected titles, and a negative time-remaining readout. Drag around the blank outer ring of the onscreen click wheel to navigate clockwise/counterclockwise. Settings → Appearance opens a dial-controlled list of 16 finishes with color swatches and a checkmark: Silver, Black, Blue, Green, Pink, Purple, Orange, Yellow, Red, Gold, Rose Gold, Space Gray, Midnight, Starlight, Alpine Green, and a special Spotify edition (shaded green shell, charcoal wheel and green accents). Rotate through Appearance to preview each finish without saving. Press Center to save it and return to the previous screen; leaving the list (including the idle switch to Now Playing) restores the saved finish. The checkmark always identifies the saved color. The colors approximate historical Apple iPod/iPhone finishes on screen; Settings → Clicker enables soft navigation clicks (Off by default). Both choices are saved. Motion respects the system's reduced-motion preference.

After ten seconds without interaction, the widget shows Now Playing. Automatic and manually opened Now Playing use the same controls: rotate for volume, press Center to browse songs, or MENU to go Home. Touching/pressing down on the dial alone does not change screens; selection occurs on release. The Spotify connection form and loading pages suspend the idle switch. If no song list has been visited yet, Center opens the current Spotify playlist when its context is available, otherwise Songs. These shortcuts are customized for DialPod; on an original iPod Classic, Center cycles playback views and holding Menu goes Home.

Keyboard: up/down navigate (volume on Now Playing); Enter selects; Escape/Backspace act as Menu; Space opens Now Playing first, then toggles playback; left/right skip; Shift+left/right seek ten seconds. Keyboard shortcuts operate when the widget has focus. D100H plugin controls work while the widget is in the background.

## Connect Spotify

1. Create or select your app in the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
2. Register exactly `http://127.0.0.1:43821/callback` as a redirect URI. Select Web API when creating the app.
3. Add your Spotify account in the app's authorized user list if required by development mode.
4. In DialPod, select Settings → Spotify Connection (or click Connect Spotify), paste the app's Client ID, and click Connect Spotify. Approve the connection in your browser. If you connected an earlier version, reconnect to grant the new library scopes.
5. Open Spotify on your computer and start a track. Use Settings → Playback Device to select another available Spotify Connect device with the dial.

No client secret is needed. Authorization Code with PKCE uses a state-checked loopback callback. Refresh tokens are encrypted using Electron safeStorage (Windows DPAPI) in `%APPDATA%\desktop-ulanzi-ipod-poc\spotify-session.json`. When OS encryption is unavailable, tokens stay in memory and login is required again after restart. Disconnect removes the saved refresh token. App revocation is available in your Spotify account's Apps page.

Spotify Premium is required for playback controls and for the owner of a development-mode app. Development mode currently allows up to five authorized users. See [Spotify quota modes](https://developer.spotify.com/documentation/web-api/concepts/quota-modes). Scopes: `user-read-playback-state`, `user-modify-playback-state`, `user-read-currently-playing`, `playlist-read-private`, `playlist-read-collaborative`, `user-library-read`.

Spotify does not expose [playlist folders](https://developer.spotify.com/documentation/web-api/concepts/playlists), so this app provides a nested Music menu and a flat playlist list rather than mirroring Spotify folders. The current [playlist items endpoint](https://developer.spotify.com/documentation/web-api/reference/get-playlists-items) only permits browsing playlists you own or collaborate on. Other playlist metadata can appear in the list; Play this playlist remains available even if Spotify denies access to its song list. Reading uses the current `/playlists/{id}/items` endpoint and handles both `item` and older `track` response fields. Selecting a playlist song starts the playlist at that song's original position, preserving playlist context.

Polling runs every five seconds with overlapping requests prevented. API calls have timeouts; 401 responses refresh tokens and 429 responses respect Retry-After. A device may restrict volume or other controls; Spotify will report an error in the widget. No active device means you should start playback in Spotify first.

Volume feedback is immediate in the widget. Spotify volume writes are limited to one at a time, starting at most every 200 ms, with queued turns replaced by the latest target. Older playback polls cannot overwrite a volume adjustment while it is pending or for 1.2 seconds after acknowledgement. Consecutive hardware steps are combined without losing their direction or crossing button actions. Actual audio changes still depend on Spotify's network response and playback device.

## Ulanzi D100H

The D100H is the hardware control surface; the Electron widget is its visual display. Ulanzi Studio handles Bluetooth pairing and dispatches key/encoder events using the official HTML plugin SDK.

```powershell
npm run plugin:build
npm run plugin:install
npm run studio:restart
```

The installer copies `ulanzi-plugin\com.ulanzi.dialpod.ulanziPlugin` into `%APPDATA%\Ulanzi\UlanziDeck\Plugins`. It backs up an existing DialPod installation before updating. Restart the Ulanzi background process to load changes; closing its window alone may leave the old plugin running. `npm run studio:restart` restarts the verified Studio executable. Pair your D100H and keep Studio running. For a custom Studio data directory, run `scripts\install-plugin.ps1 -PluginsDirectory 'your path'`.

Assign **DialPod Navigation Wheel** to the dial. Rotate to navigate lists or adjust volume on Now Playing. Single-click the center dial to select; double-click within 350 ms to use Menu: go Home from Now Playing, or back one level elsewhere. Single-click selection waits 350 ms to distinguish it from a double-click. The separate Menu button has the same behavior. Rotating while held suppresses selection. Hold-only Back is not supported by the events received from Studio.

Physical button mapping:

| Position | Plugin action |
| --- | --- |
| Top left | Previous Track |
| Top middle | Play / Pause |
| Top right | Next Track |
| Left side, upper button | Menu / Back |
| Other side buttons | Optional volume/seek actions |

You can choose another side button for Menu / Back. Assign actions in Studio, or import `ulanzi-plugin\DialPod.ulanziDeckProfile` as a separate profile. It maps the dial, top three transport buttons, and a side Menu button using the installed Studio factory Dial profile schema; other side keys are volume up/down and seek back. The generated archive has been structurally checked, but importing it and verifying physical button positions require Studio and your paired device. Your active device profile is preserved. The hardware layout was checked against [Ulanzi's D100H product photos](https://www.ulanzi.com/products/d100h-dial-creative-controller-i003).

The status label reports **plugin online**, based on a Studio plugin heartbeat. It does not prove that the D100H is physically paired. Verify Bluetooth pairing in Studio. The original `com.nexez.ipod.ulanziPlugin` folder is retained as legacy reference; install the new `com.ulanzi.dialpod.ulanziPlugin` package.

Bridge: `GET http://127.0.0.1:4765/device/state`; `POST /device/event` accepts JSON such as `{"type":"command","command":"next"}` or `{"type":"dial","delta":1,"held":false}`. It binds only to loopback, validates commands and request size, and rejects ordinary website origins. Local applications and file/WebView pages can reach the bridge. No Spotify tokens are exposed through it. Keep ports 4765 and 43821 available.

Qt/Ulanzi WebViews send the `file://` origin; the bridge explicitly allows it as well as `null` for other local WebViews, including the CORS preflight response. Device state includes `lastEvent` and `eventCount` for checking whether actual dial/key events arrive, separate from the plugin heartbeat.

## Verification and build

```powershell
npm run check
npm run smoke
npm run package
```

Tests cover PKCE, playback and library requests, original playlist positions, hierarchy/selection preservation, value bounds, refresh deduplication, rate limiting, bridge validation, and Ulanzi dispatch. The Electron smoke test drives actual navigation through hardware events: Music → Playlists → playlist → highlighted song, transport controls, Menu history, Settings → Volume, and connection form. It saves menu and playback screenshots in `artifacts` and exits. It uses a separate test session and bridge port (4766), so it can run alongside your widget without contacting Spotify.

Software checks simulate Spotify responses and hardware events. Live playback and BLE hardware operation require your account and paired device and have not been validated by these tests.

## References

- [Spotify PKCE](https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow)
- [Spotify redirect rules](https://developer.spotify.com/documentation/web-api/concepts/redirect_uri)
- [Spotify playback API](https://developer.spotify.com/documentation/web-api/reference/start-a-users-playback)
- [Official Ulanzi plugin SDK](https://github.com/UlanziTechnology/UlanziDeckPlugin-SDK)
- [Ulanzi Studio download](https://www.ulanzi.com/pages/ulanzi-app)

The vendored Ulanzi SDK retains its Apache 2.0 license in `libs/LICENSE` and source attribution in `libs/NOTICE.md`.

Quickly press Next/Previous to skip tracks. Hold either for 500 ms to fast-forward/rewind the current song (also supported on the onscreen buttons). Spotify receives live seek updates while held, at most every 450 ms with only one request in flight. New positions replace queued ones, and the latest position is retained on release without skipping tracks. The progress bar updates immediately; actual audio timing depends on Spotify and the playback device. If release is lost, seeking stops after 15 seconds.


## Interfaces and appearance

Settings → Appearance changes the case finish; Settings → Screen toggles Light/Dark independently of the case and wheel finish. Screen preference is saved separately and remains unchanged during appearance previews.

The screen/wheel gap is approximately 53 CSS pixels at the default 380 × 710 window size, based on the proportions of Apple's iPod Classic front view (an image estimate, not a published mechanical measurement). Minimum window height is 700 pixels to preserve the gap and footer.

Settings → Interface offers iPod (default), Zune, and Floating Radial. Zune mode targets the 2007 Zune 80: a compact portrait enclosure, blank metallic-rimmed pad, flat oval buttons, direct lowercase home menu, blue geometric wallpaper, and full-width album art with compact track details below it. Both Light/Dark screens work with either interface, and case finishes and dial behavior are preserved. Selecting an interface saves it and returns to Settings.

Zune mode also changes the enclosure to a Zune 80-inspired portrait body with a rounded-square Zune Pad and separate Back and Play/Pause buttons. Music opens a playlists/songs tab browser; the pad left/right changes categories. Back returns one level, including from Now Playing; hold the onscreen or D100H Menu/Back button for Home. Play/Pause toggles directly from menus. Center on Now Playing opens playback options (song list, volume, playback device, and return to playback). The D100H wheel still browses lists and controls volume on Now Playing, and its transport keys retain tap-to-skip/hold-to-seek. iPod mode retains its previous controls. Spotify library availability still determines the categories this app can offer.

Zune proportions are based on the Zune 80 front view (61.1 × 108.2 mm), with the window resized to approximately the same body ratio. Desktop window controls appear when hovering over the top rim. The normal volume/device widgets are hidden on Zune Now Playing; turn the dial for a temporary volume overlay, or use playback options for the device picker. Back from the home menu opens Now Playing, as on the original player. Light screen and alternative case colors remain optional customizations. See docs/zune-reference.md for photo references and app-specific differences.

## Transparency and idle behavior

Settings → Transparency supports Off, Always, or Idle Fade. Opacity is the fixed visibility percentage; Idle Opacity is used only after the configured Idle Timeout (1–600 seconds, default 10). 100% is solid, 0% fully invisible. Idle Fade restores solid visibility on D100H input or local interaction and fades over roughly 650 ms. Always uses fixed opacity while interacting; at 0%, D100H input reveals the player for at least 10 seconds. Fully invisible windows pass mouse clicks through. Settings editing stays solid, and heartbeats/playback polls do not count as input. The existing Now Playing timeout is separate. Press Ctrl+Alt+Shift+D or activate DialPod from the taskbar to recover an invisible player. Transparency is disabled by default.

When Idle Fade has timed out, the first D100H dial turn, center press, or Menu/Back press only wakes the player. Its release is consumed too; use the next gesture to navigate. Play, Next and Previous wake the player and perform their normal action immediately. Fixed partial opacity does not consume controls.

## Floating Radial

Settings → Interface → Floating Radial enables a transparent, borderless desktop carousel. Settings → Screen edge mirrors and docks it at the left or right edge of the current monitor. Floating labels follow a vertically centered half-oval with distance-based fading; center selects, Menu/Back returns, and transport keys retain their existing behavior. Now Playing uses a floating album-art layout inside the arc, with track metadata, elapsed/total time, an interactive seek bar and volume slider; turn for volume and press center for the song list. Reduced-motion preferences disable carousel easing. Interface and edge are saved independently of iPod/Zune appearance and transparency. Run `npx electron scripts/verify-radial.js` to verify docking, navigation, animation, large lists and persistence with an isolated demo session.

Floating Radial → Settings → Smoky Background adjusts the feathered black backdrop independently of window transparency. The default strength is 24%; 0% removes the haze. Turn the dial to preview, press to save, or Menu/Back to cancel. The haze mirrors with Screen edge, covers the full monitor height, and fades outward along the carousel's oval curve.

Now Playing crossfades artwork, metadata and track progress over 360 ms when the song changes. It retains the outgoing display while the next cover loads (up to 600 ms), replaces pending skips with the latest track, and honors reduced motion. Volume remains interactive during transitions.


In Floating Radial song lists, the current track has a compact two-column layout: album artwork beside the title and artist, a consistent-width progress bar beneath the text, and elapsed/total time below the bar. It stays in its original list position, with extra space above and below, while retaining the oval alignment. Other song rows keep their normal artist/duration subtitles. Long titles loop horizontally in one direction only while the song is playing or the row is selected with the dial; reduced motion disables scrolling. Selecting the current track retains the existing Keep Song Position behavior.

Floating Radial Settings includes Primary Color and Accent Color. Turn the dial to preview the full hue spectrum, with White after the rainbow; press center to save and return, or Menu to cancel. Primary colors the navigation text, while Accent highlights the current song, its progress, and Now Playing controls.

Settings → Keep on Top saves whether DialPod stays above ordinary windows. Exclusive fullscreen applications can cover it.

## Playback navigation preferences

Settings has three independent switches, enabled by default:

| Setting | On | Off |
| --- | --- | --- |
| Idle to Now Playing | Open Now Playing after 10 seconds without input. | Keep the current page and selection, including through an idle transparency fade. |
| Open Song in Now Playing | Selecting a song or starting a playlist opens Now Playing. | Start playback while staying in the current list. Selecting the current song still respects Keep Song Position. |
| Play Opens Now Playing | From a menu, the first Play press opens Now Playing without changing playback; the next press pauses/resumes. | Play/Pause toggles playback directly from any page, without changing pages. |

These choices are saved across restarts and apply to all interfaces. They do not disable the separate Transparency → Idle Fade setting. If you leave the player on Now Playing and it fades out, Play/Pause still pauses or resumes on the first press. In direct playback mode it also works from a faded menu. Dial, center, and Menu retain their first-gesture wake behavior.

Settings → Reverse Dial Direction flips the D100H rotary input: clockwise moves up and counterclockwise moves down. It also reverses dial-driven adjustments such as volume and color previews. The default is Off, the choice is saved across restarts, and keyboard arrow directions remain unchanged.

## Additional D100H buttons

Assign these actions from **DialPod Spotify** in Ulanzi Studio to any spare macro buttons:

- **DialPod Like Current Song** toggles whether the song currently playing in Spotify is in Liked Songs. Press again to remove the like. Local files and non-song items cannot be liked with this action.
- **DialPod Shuffle** toggles shuffle on/off using Spotify's current playback state.
- **DialPod Repeat** cycles Off → All (current playlist/context) → One song → Off.

These actions work from any page and wake an idle player. Floating Radial shows brief confirmation text. Reconnect Spotify through Settings → Spotify Connection once after updating to grant `user-library-modify`; existing login tokens cannot gain the permission just by restarting. Shuffle and Repeat use the existing playback permission. Install the updated plugin with `npm run plugin:install`, then restart its background service with `npm run studio:restart` so the new actions appear. Existing button assignments are preserved.

API references: [Save Items to Library](https://developer.spotify.com/documentation/web-api/reference/save-library-items), [Shuffle](https://developer.spotify.com/documentation/web-api/reference/toggle-shuffle-for-users-playback), [Repeat](https://developer.spotify.com/documentation/web-api/reference/set-repeat-mode-on-users-playback).

Now Playing displays a heart for liked status, a shuffle indicator, and repeat status (including a 1 for repeat-one). Enabled indicators use the accent color in Floating Radial; inactive modes remain dim. Library lookup failures show an unavailable heart state rather than claiming a song is unliked. Like toggles only the current playing song without changing pages or playback.

**DialPod Pin Widget** is an assignable D100H macro action that pauses/resumes idle behavior from any page, with brief pinned/unpinned feedback. It saves independently of Settings → Keep on Top; the macro never changes window stacking.

While Pin Widget is enabled, the automatic idle switch to Now Playing and idle transparency fading are suspended. Unpinning restores the saved idle settings and begins a fresh idle countdown. Fixed Always transparency remains at the chosen opacity.

Like synchronization distinguishes an accepted write from a confirmed Spotify library state. The heart pulses while background reads confirm the latest requested like/unlike. A newer press supersedes older checks without waiting for confirmation; stale reads do not reverse the pending choice. Confirmation retries back off and respect rate-limit cooldowns. If confirmation fails, DialPod shows the last observed Spotify state (or unavailable if no read succeeded) and a retry message instead of claiming success. Spotify's desktop UI can refresh separately from the API.

