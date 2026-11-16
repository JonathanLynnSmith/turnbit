// Runs every offline Electron harness in turn and reports which failed.
// `node scripts/verify-all.js` runs them all; pass names to run a subset,
// for example `node scripts/verify-all.js radial wake`.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

// verify-studio needs a running Ulanzi Studio and a debug-enabled turnbit.
const SKIPPED = new Set(['verify-studio.js']);
const wanted = process.argv.slice(2);
const harnesses = [
  'smoke.js',
  ...fs
    .readdirSync(__dirname)
    .filter((name) => /^verify-.*\.js$/.test(name) && name !== 'verify-all.js')
    .sort(),
].filter(
  (name) =>
    !SKIPPED.has(name) &&
    (!wanted.length || wanted.some((part) => name.includes(part))),
);

const electron = require('electron');
const failed = [];
for (const name of harnesses) {
  const started = Date.now();
  const result = spawnSync(electron, [path.join(__dirname, name)], {
    encoding: 'utf8',
    timeout: 180000,
  });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  if (result.status === 0) {
    console.log(`pass  ${name} (${seconds}s)`);
    continue;
  }
  failed.push(name);
  console.log(`FAIL  ${name} (${seconds}s)`);
  const output = `${result.stdout || ''}${result.stderr || ''}`.trim();
  console.log(
    output
      .split('\n')
      .slice(-15)
      .map((line) => '      ' + line)
      .join('\n'),
  );
}
console.log(
  `\n${harnesses.length - failed.length} of ${harnesses.length} harnesses passed.` +
    (failed.length ? ` Failed: ${failed.join(', ')}` : ''),
);
process.exit(failed.length ? 1 : 0);
