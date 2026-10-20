const test = require("node:test");
const assert = require("node:assert/strict");
const { createPlaybackDispatcher } = require("../src/app/playback-dispatcher");

test("shared dispatcher orders transport, bypasses pending transport for adjustments, and survives failure", async () => {
  const calls = [];
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  const dispatch = createPlaybackDispatcher(async (command) => {
    calls.push(command);
    if (command === "next") await pending;
    if (command === "previous") throw new Error("offline");
    return command;
  });
  const next = dispatch("next");
  const failed = assert.rejects(dispatch("previous"), /offline/);
  const toggle = dispatch("toggle");
  await dispatch("volume", 25);
  await dispatch("seek", 1000);
  assert.deepEqual(calls, ["next", "volume", "seek"]);
  release();
  await Promise.all([next, failed, toggle]);
  assert.deepEqual(calls, ["next", "volume", "seek", "previous", "toggle"]);
});
