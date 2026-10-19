const { contextBridge, ipcRenderer } = require('electron');
const subscribe = (channel) => (callback) => {
  const handler = (_, data) => callback(data);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};
contextBridge.exposeInMainWorld('turnbit', {
  configure: (id) => ipcRenderer.invoke('spotify:configure', id),
  login: () => ipcRenderer.invoke('spotify:login'),
  logout: () => ipcRenderer.invoke('spotify:logout'),
  status: () => ipcRenderer.invoke('spotify:status'),
  devices: () => ipcRenderer.invoke('spotify:devices'),
  playback: {
    getState: () => ipcRenderer.invoke('playback:state'),
    refresh: () => ipcRenderer.invoke('playback:refresh'),
    command: (command, value) =>
      ipcRenderer.invoke('playback:command', command, value),
    onEvent: subscribe('playback-event'),
    presentation: (hidden) => ipcRenderer.send('playback:presentation', hidden),
  },
  library: { page: (request) => ipcRenderer.invoke('library:page', request) },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    update: (patch) => ipcRenderer.invoke('settings:update', patch),
    importLegacy: (value) => ipcRenderer.invoke('settings:import', value),
    onChange: subscribe('settings-changed'),
  },
  inputContext: (value) => ipcRenderer.send('input:context', value),
  recovery: (value) => ipcRenderer.invoke('spotify:recovery', value),
  setInterface: (style, side, layout) =>
    ipcRenderer.invoke('app:interface', style, side, layout),
  windowGesture: (phase, kind) =>
    ipcRenderer.invoke('app:window-gesture', phase, kind),
  displays: () => ipcRenderer.invoke('app:displays'),
  visibility: (settings, protectedView, dialOnlyWake, mousePassthrough) =>
    ipcRenderer.invoke(
      'app:visibility',
      settings,
      protectedView,
      dialOnlyWake,
      mousePassthrough,
    ),
  activity: () => ipcRenderer.send('app:activity'),
  mouseMode: (key) => ipcRenderer.invoke('app:mouse-mode', key),
  hardware: () => ipcRenderer.invoke('app:hardware'),
  pin: (value) => ipcRenderer.invoke('app:pin', value),
  windowMode: (value) => ipcRenderer.invoke('app:window-mode', value),
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
  minimize: () => ipcRenderer.invoke('app:minimize'),
  close: () => ipcRenderer.invoke('app:close'),
  onVisibility: subscribe('app-visibility'),
  onAuth: subscribe('spotify-auth'),
  onDeviceEvent: subscribe('device-event'),
  onMouseMode: subscribe('mouse-mode'),
  onBridgeError: subscribe('bridge-error'),
});
