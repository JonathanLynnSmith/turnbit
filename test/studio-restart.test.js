const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');

test('Studio restart waits for shutdown and matches the executable path literally', async () => {
  const events = [];
  let polls = 0;
  const source = fs.readFileSync(path.join(__dirname,'../scripts/restart-studio.js'),'utf8');
  const context = {
    require: name => name === 'node:fs' ? { existsSync: () => true } : name === 'node:path' ? path : {
      execFileSync: (command,args) => {
        assert.equal(command,'pgrep');
        assert.equal(args[1],'^/Applications/Ulanzi Studio\\.app/Contents/MacOS/UlanziDeck( |$)');
        events.push('poll');
        if (++polls < 3) return '1234\n';
        throw Object.assign(new Error('No process'),{status:1});
      },
      spawn: () => {
        events.push('spawn');
        const child = new EventEmitter();child.unref = () => events.push('unref');
        queueMicrotask(() => child.emit('spawn'));
        return child;
      }
    },
    process: { platform:'darwin',argv:[],kill: (pid,signal) => { assert.equal(pid,1234);assert.equal(signal,'SIGTERM');events.push('terminate'); } },
    console: { log: () => events.push('success'),error: error => { throw new Error(error); } },
    Date, setTimeout: resolve => queueMicrotask(resolve)
  };
  vm.runInNewContext(source,context);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(events,['poll','terminate','poll','poll','spawn','unref','success']);
});
