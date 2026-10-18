const { contextBridge, ipcRenderer } = require('electron');
const subscribe = channel => callback => {
  const handler = (_, data) => callback(data); ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};
contextBridge.exposeInMainWorld('turnbit', {
  configure: id => ipcRenderer.invoke('spotify:configure', id), login: () => ipcRenderer.invoke('spotify:login'), logout: () => ipcRenderer.invoke('spotify:logout'),
  status: () => ipcRenderer.invoke('spotify:status'), state: () => ipcRenderer.invoke('spotify:state'), command: (command, value) => ipcRenderer.invoke('spotify:command', command, value), devices: () => ipcRenderer.invoke('spotify:devices'),
  library: (kind, id, offset) => ipcRenderer.invoke('spotify:library', kind, id, offset),
  recovery: value=>ipcRenderer.invoke('spotify:recovery',value),
  setInterface: (style,side,layout)=>ipcRenderer.invoke('app:interface',style,side,layout),
  windowGesture: (phase,kind)=>ipcRenderer.invoke('app:window-gesture',phase,kind),
  displays: ()=>ipcRenderer.invoke('app:displays'),
  visibility: (settings,protectedView,dialOnlyWake,mousePassthrough)=>ipcRenderer.invoke('app:visibility',settings,protectedView,dialOnlyWake,mousePassthrough),
  activity: ()=>ipcRenderer.send('app:activity'),
  mouseMode: key=>ipcRenderer.invoke('app:mouse-mode',key),
  hardware: () => ipcRenderer.invoke('app:hardware'), pin: value => ipcRenderer.invoke('app:pin', value), windowMode: value => ipcRenderer.invoke('app:window-mode', value), openExternal: url => ipcRenderer.invoke('app:open-external', url), minimize: () => ipcRenderer.invoke('app:minimize'), close: () => ipcRenderer.invoke('app:close'),
  onVisibility: subscribe('app-visibility'), onState: subscribe('spotify-state'), onAuth: subscribe('spotify-auth'), onDeviceEvent: subscribe('device-event'), onMouseMode: subscribe('mouse-mode'), onBridgeError: subscribe('bridge-error')
});
