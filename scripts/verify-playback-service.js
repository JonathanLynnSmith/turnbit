// Runs the real desktop composition with a fake Spotify network boundary.
// No credentials, Spotify process, or external API calls are used.
const { app, BrowserWindow } = require("electron");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { SpotifyClient } = require("../src/spotify");

app.disableHardwareAcceleration();
const directory = fs.mkdtempSync(
  path.join(os.tmpdir(), "turnbit-playback-test-"),
);
app.setPath("userData", directory);
process.env.TURNBIT_BRIDGE_PORT = "4817";
const tracks = ["First", "Second"].map((name, index) => ({
  uri: `spotify:track:${String(index).repeat(22)}`,
  name,
  artists: [{ name: "Test Artist" }],
  album: { name: "Test Album", images: [] },
  duration_ms: 240000,
}));
let index = 0,
  playing = true,
  volume = 50;
const calls = [];
require.cache[require.resolve("../src/spotify")].exports = {
  SpotifyClient: class extends SpotifyClient {
    constructor(onState, options) {
      super(onState, {
        ...options,
        persist: () => {},
        media: null,
        session: { clientId: "a".repeat(32), refreshToken: "test" },
        fetch: async (url, options) => {
          const route = new URL(url);
          calls.push(route.pathname);
          if (!options.method) {
            if (route.pathname.endsWith("/contains"))
              return new Response("[false]");
            if (route.pathname === "/v1/me/player")
              return new Response(
                JSON.stringify({
                  item: tracks[index],
                  is_playing: playing,
                  progress_ms: 1000,
                  shuffle_state: false,
                  repeat_state: "off",
                  device: {
                    id: "speaker",
                    name: "Test Speaker",
                    type: "Speaker",
                    volume_percent: volume,
                  },
                }),
              );
            if (route.pathname === '/v1/me/tracks') return new Response(JSON.stringify({items:tracks.map(track=>({track})),total:tracks.length,next:null}));
            throw new Error(`Unexpected read: ${route.pathname}`);
          }
          if (
            route.pathname.endsWith("/next") ||
            route.pathname.endsWith("/previous")
          )
            index = 1 - index;
          else if (route.pathname.endsWith("/volume"))
            volume = Number(route.searchParams.get("volume_percent"));
          else if (route.pathname.endsWith("/pause")) playing = false;
          else if (route.pathname.endsWith("/play")) playing = true;
          else throw new Error(`Unexpected write: ${route.pathname}`);
          return new Response(null, { status: 204 });
        },
      });
      this.setTokens({
        access_token: "test",
        refresh_token: "test",
        expires_in: 3600,
      });
    }
  },
};
require("../src/main");
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, label) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await wait(50);
  }
  throw new Error(`Timed out: ${label}`);
}
async function main() {
  await app.whenReady();
  let win;
  await until(() => {
    win = BrowserWindow.getAllWindows()[0];
    return win && !win.webContents.isLoading();
  }, "desktop startup");
  const errors = [];
  win.webContents.on("console-message", (_event, level, message) => {
    if (level === 3) errors.push(message);
  });
  let run = (code) => win.webContents.executeJavaScript(code);
  await until(
    async () =>
      run(`typeof api!=='undefined'&&!demo&&playback?.item?.name==='First'`),
    "normalized state reaches existing view",
  );
  const state = await run("window.turnbit.playback.getState()");
  assert.equal(state.track.title, "First");
  assert.equal(state.item, undefined);
  assert.equal(state.device.volume, 50);
  await run(
    `savePreferences({playOpensNowPlaying:false,mouseModeKey:'off',idleNowPlaying:false});window.turnbit.playback.command('next')`,
  );
  await until(
    async () => run(`playback?.item?.name==='Second'`),
    "direct service command refreshes UI",
  );
  const response = await fetch("http://127.0.0.1:4817/device/event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "command", command: "previous" }),
  });
  assert.equal(response.status, 204);
  await until(
    async () => run(`playback?.item?.name==='First'`),
    "hardware uses the same service",
  );
  await run(`window.turnbit.playback.command('volume',72)`);
  await until(async () => run(`volume===72`), "accepted volume reaches the UI");
  assert.equal(
    (await run("window.turnbit.playback.getState()")).device.volume,
    72,
  );
  const page = await run("window.turnbit.library.page({kind:'songs'})");
  assert.equal(page.items[0].track.title,'First');
  assert.equal(page.nextOffset,null);
  await run("showLibrary('songs')");
  await until(async()=>run("nav.current.rows.some(row=>row.action==='song'&&row.label==='First')"),'normalized library reaches browsing controller');
  await run("savePreferences({autoLaunchSpotify:false})");
  await until(async()=>!(await run("window.turnbit.settings.get()")).autoLaunchSpotify,'backend settings persist');
  const before = calls.length;
  win.webContents.reload();
  await new Promise((resolve) =>
    win.webContents.once("did-finish-load", resolve),
  );
  await until(
    async () =>
      run(`typeof api!=='undefined'&&!demo&&playback?.item?.name==='First'`),
    "reload reconnects to existing service",
  );
  assert.equal(
    (await run("window.turnbit.playback.getState()")).device.volume,
    72,
  );
  assert.ok(calls.length > before, "reloaded view requests current state");
  await run(`window.turnbit.playback.command('pause')`);
  await until(
    async () => run(`!playing`),
    "playback stays usable after reload",
  );
  // A missing renderer must not take hardware playback down with it.
  const gone = new Promise(resolve=>win.webContents.once('render-process-gone',resolve));
  win.webContents.forcefullyCrashRenderer();await gone;
  const commandResponse=await fetch('http://127.0.0.1:4817/device/event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'command',command:'next'})});
  assert.equal(commandResponse.status,204);
  await until(()=>index===1,'hardware playback while the renderer is gone');
  const loaded=new Promise(resolve=>win.webContents.once('did-finish-load',resolve));
  win.webContents.reload();await loaded;
  await until(async()=>run("typeof api!=='undefined'&&!demo&&playback?.item?.name==='Second'"),'renderer recovers current backend state');
  assert.equal((await run('window.turnbit.settings.get()')).autoLaunchSpotify,false);
  assert.deepEqual(errors, []);
  console.log(
    "Playback service: normalized IPC, view updates, library browsing, backend settings, hardware commands without a renderer, volume, reload, and continued playback passed.",
  );
  app.quit();
}
main().catch((error) => {
  console.error(error);
  app.exit(1);
});
