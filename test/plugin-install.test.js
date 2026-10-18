const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { installPlugin } = require('../scripts/install-plugin');

test('plugin updates replace stale files and preserve backups outside Studio discovery', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'turnbit-install-test-'));
  t.after(() => fs.rmSync(dir,{recursive:true,force:true}));
  const plugins = path.join(dir,'Plugins'), source = path.join(dir,'source');
  fs.mkdirSync(plugins);fs.mkdirSync(source);
  fs.writeFileSync(path.join(source,'app.js'),'version one');
  const first = installPlugin(plugins,source);
  fs.writeFileSync(path.join(first.destination,'obsolete.js'),'old');
  fs.writeFileSync(path.join(source,'app.js'),'version two');
  const update = installPlugin(plugins,source);
  assert.equal(fs.readFileSync(path.join(update.destination,'app.js'),'utf8'),'version two');
  assert.equal(fs.existsSync(path.join(update.destination,'obsolete.js')),false);
  assert.equal(fs.readFileSync(path.join(update.backup,'app.js'),'utf8'),'version one');
  assert.equal(fs.existsSync(path.join(update.backup,'obsolete.js')),true);
  assert.deepEqual(fs.readdirSync(plugins),['com.turnbit.spotify.ulanziPlugin']);
  assert.throws(() => installPlugin(plugins,path.join(dir,'missing')));
  assert.equal(fs.readFileSync(path.join(update.destination,'app.js'),'utf8'),'version two','failed preparation preserves the installed plugin');
});
