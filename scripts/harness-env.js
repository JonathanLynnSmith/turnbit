// Required first by every Electron harness. Chromium pauses animations and
// timers in a window that another window covers, so a harness waiting on a
// transition would stall whenever its window was not in front.
const { app } = require('electron');

app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
