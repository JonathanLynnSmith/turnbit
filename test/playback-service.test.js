const test = require("node:test");
const assert = require("node:assert/strict");
const { createPlaybackService } = require("../src/app/playback-service");

const settle = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};
function fakeClock() {
  let time = 0;
  const timers = new Map();
  return {
    now: () => time,
    setTimeout(fn, delay) {
      const key = {};
      timers.set(key, { fn, at: time + delay });
      return key;
    },
    clearTimeout(key) {
      timers.delete(key);
    },
    async advance(ms) {
      const target = time + ms;
      for (let i = 0; i < 100; i++) {
        const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > target) break;
        time = next[1].at;
        timers.delete(next[0]);
        next[1].fn();
        await settle();
      }
      time = target;
      await settle();
    },
    get count() {
      return timers.size;
    },
  };
}
function setup() {
  const clock = fakeClock(),
    listeners = new Set(),
    commands = [];
  let reads = 0;
  const snapshot = {
    track: { id: "song", title: "Song", durationMs: 600000 },
    playing: true,
    positionMs: 0,
    observedAt: 0,
    transport: "remote",
    capabilities: { play: true, pause: true, seek: true },
  };
  const provider = {
    capabilities: {
      play: true,
      pause: true,
      next: true,
      previous: true,
      seek: true,
      volume: true,
      like: false,
    },
    read: async () => {
      reads++;
      return { ...structuredClone(snapshot), observedAt: clock.now() };
    },
    command: async (name, value) => {
      commands.push({ name, value });
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  const service = createPlaybackService(provider, { clock });
  return {
    service,
    provider,
    snapshot,
    clock,
    commands,
    emit: (event) => {
      for (const listener of listeners) listener(event);
    },
    get reads() {
      return reads;
    },
    get subscribers() {
      return listeners.size;
    },
  };
}
async function start(fixture) {
  fixture.service.setConnected(true);
  await fixture.service.refresh();
}

test("two clients share canonical state without exposing it to mutation", async (t) => {
  const f = setup();
  t.after(() => f.service.dispose());
  const first = [],
    second = [];
  const unsubscribe = f.service.subscribe((event) => {
    first.push(event);
    if (event.state) event.state.track.title = "mutated";
  });
  f.service.subscribe((event) => second.push(event));
  await start(f);
  assert.equal(f.service.getState().track.title, "Song");
  assert.equal(second[0].state.track.title, "Song");
  const copy = f.service.getState();
  copy.track.title = "changed";
  assert.equal(f.service.getState().track.title, "Song");
  unsubscribe();
  f.emit({ type: "notice", message: "Recovering player" });
  assert.equal(first.length, 1);
  assert.equal(second.at(-1).message, "Recovering player");
});

test("backend polls without a frontend and slows for hidden and paused presentation", async (t) => {
  const f = setup();
  t.after(() => f.service.dispose());
  await start(f);
  assert.equal(f.reads, 1);
  await f.clock.advance(5000);
  assert.equal(f.reads, 2);
  f.service.setPresentation({ hidden: true });
  await f.clock.advance(29999);
  assert.equal(f.reads, 2);
  await f.clock.advance(1);
  assert.equal(f.reads, 3);
  f.service.setPresentation({ hidden: false });
  await f.service.refresh();
  assert.equal(f.reads, 4);
  f.snapshot.playing = false;
  await f.service.refresh();
  const reads = f.reads;
  await f.clock.advance(14999);
  assert.equal(f.reads, reads);
  await f.clock.advance(1);
  assert.equal(f.reads, reads + 1);
  f.service.dispose();
  await f.clock.advance(60000);
  assert.equal(f.reads, reads + 1);
  assert.equal(f.clock.count, 0);
  assert.equal(f.subscribers, 0);
});

test("track end is checked once even when a provider lags the transition", async (t) => {
  const f = setup();
  t.after(() => f.service.dispose());
  f.snapshot.track.durationMs = 10000;
  f.snapshot.positionMs = 9000;
  await start(f);
  await f.clock.advance(1499);
  assert.equal(f.reads, 1);
  await f.clock.advance(1);
  assert.equal(f.reads, 2);
  await f.clock.advance(4999);
  assert.equal(f.reads, 2);
  await f.clock.advance(1);
  assert.equal(f.reads, 3);
});

test("a newer provider event wins over a pending read, and concurrent refreshes are deduplicated", async (t) => {
  const f = setup();
  t.after(() => f.service.dispose());
  let release,
    reads = 0;
  f.provider.read = () => {
    reads++;
    return new Promise((resolve) => {
      release = resolve;
    });
  };
  f.service.setConnected(true);
  const first = f.service.refresh(),
    second = f.service.refresh();
  assert.equal(first, second);
  await settle();
  f.emit({
    type: "state",
    state: { ...f.snapshot, track: { ...f.snapshot.track, id: "new-song" } },
  });
  release(f.snapshot);
  assert.equal((await first).track.id, "new-song");
  assert.equal(reads, 1);
});

test("disconnect prevents a late read and queued commands from leaking into a new session", async (t) => {
  const f = setup();
  t.after(() => f.service.dispose());
  await start(f);
  let release;
  f.provider.command = async (name) => {
    f.commands.push(name);
    if (name === "next")
      await new Promise((resolve) => {
        release = resolve;
      });
  };
  const next = f.service.command("next");
  const queued = assert.rejects(
    f.service.command("previous"),
    /Connect a playback provider/,
  );
  await settle();
  f.service.setConnected(false);
  f.service.setConnected(true);
  await f.service.refresh();
  release();
  await Promise.all([next, queued]);
  assert.deepEqual(f.commands, ["next"]);
  let readRelease;
  f.provider.read = () =>
    new Promise((resolve) => {
      readRelease = resolve;
    });
  const pending = f.service.refresh();
  await settle();
  f.service.setConnected(false);
  readRelease(f.snapshot);
  await pending;
  assert.equal(f.service.getState(), null);
  assert.equal(f.clock.count, 0);
});

test("unsupported controls reject before provider execution and failed commands do not block later commands", async (t) => {
  const f = setup();
  t.after(() => f.service.dispose());
  const errors = [];
  f.service.subscribe((event) => {
    if (event.type === "error") errors.push(event.message);
  });
  await start(f);
  await assert.rejects(f.service.command("like"), {
    code: "UNSUPPORTED_PLAYBACK_COMMAND",
  });
  f.emit({
    type: "state",
    state: { ...f.snapshot, capabilities: { seek: false } },
  });
  await assert.rejects(f.service.command("seek", 100), {
    code: "UNSUPPORTED_PLAYBACK_COMMAND",
  });
  f.provider.command = async (name) => {
    if (name === "next") throw new Error("offline");
    f.commands.push(name);
  };
  await assert.rejects(f.service.command("next"), /offline/);
  await f.service.command("previous");
  assert.deepEqual(f.commands, ["previous"]);
  assert.equal(errors.length, 3);
  const reads = f.reads;
  await f.clock.advance(599);
  assert.equal(f.reads, reads);
  await f.clock.advance(1);
  assert.equal(f.reads, reads + 1);
});

test("poll failures preserve the last snapshot, surface an error, and resume polling", async (t) => {
  const f = setup();
  t.after(() => f.service.dispose());
  const errors = [];
  f.service.subscribe((event) => {
    if (event.type === "error") errors.push(event.message);
  });
  await start(f);
  const read = f.provider.read;
  f.provider.read = async () => {
    throw new Error("temporary outage");
  };
  await f.clock.advance(5000);
  assert.equal(f.service.getState().track.title, "Song");
  assert.deepEqual(errors, ["temporary outage"]);
  f.provider.read = read;
  await f.clock.advance(5000);
  assert.equal(f.reads, 2);
});
