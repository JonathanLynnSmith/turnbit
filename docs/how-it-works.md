# How turnbit works

## Spotify

- turnbit controls Spotify through the [Spotify Web API](https://developer.spotify.com/documentation/web-api).
  Audio always plays in Spotify itself.
- When the Spotify desktop app is playing on the same computer, play, pause, skip, and seek go
  straight to the app: through its media session on Windows, and through its AppleScript controls on
  macOS. They work instantly, use no API calls, and never affect other apps. Phones, speakers, and
  other computers go through the Web API.
- turnbit checks Spotify less often when music is paused or the window is hidden, which helps it stay
  within Spotify's rate limits. If Spotify rate-limits a feature, only that feature pauses, and
  turnbit shows when it will be available again.

## Choosing a device

- **Automatic** picks the device you last played on, then whatever Spotify still calls active, then
  the only computer it can see.
- A chosen **Preferred Device** overrules all of that. If it is unavailable, turnbit says so rather
  than starting music somewhere else.
- If you start a song after Spotify has gone idle, turnbit reconnects to your Preferred Device
  (opening Spotify first, if you allow it) and tries the song again.
- Spotify can only resume a player that already has a song loaded, so Play alone does nothing after a
  fresh start. turnbit gives it something to play instead, from **When Nothing Is Playing**: the
  context your last session was in, your Liked Songs, or a playlist you pick. That costs at most one
  extra Spotify call, and the Liked Songs list is reused for ten minutes.

## The dial

The Ulanzi plugin talks to turnbit through a small HTTP bridge on `127.0.0.1:4765`, not as keyboard
or mouse input. Because of that the system would happily dim or sleep the screen while you navigate,
so turnbit holds the display awake while the dial is in use and lets go a minute after it goes quiet.

- `GET /device/state` returns the plugin status, last event, and event count.
- `POST /device/event` accepts JSON such as `{"type":"command","command":"next"}` or
  `{"type":"dial","delta":1,"held":false}`.

The bridge listens only on your own machine, validates every request, and rejects ordinary websites.
It never exposes your Spotify login. turnbit also needs port `43821` free for the Spotify login
callback.

## Spotify permissions

turnbit requests these scopes: `user-read-playback-state`, `user-modify-playback-state`,
`user-read-currently-playing`, `playlist-read-private`, `playlist-read-collaborative`,
`user-library-read`, and `user-library-modify`.

Login uses Authorization Code with PKCE and a state-checked local callback. No client secret is
needed. Your login is saved encrypted by your system's secure storage, and **Disconnect** deletes it.
You can revoke access at any time from the Apps page of your Spotify account.

## Debug logging

To see every Spotify API call and any rate-limit wait, start turnbit with logging on:

```powershell
# Windows (PowerShell)
$env:TURNBIT_DEBUG_API=1; npm start
```

```bash
# macOS / Linux
TURNBIT_DEBUG_API=1 npm start
```
