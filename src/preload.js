const { contextBridge, ipcRenderer } = require('electron');
const subscribe = channel => callback => {
  const handler = (_, data) => callback(data); ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};
contextBridge.exposeInMainWorld('dialpod', {
  configure: id => ipcRenderer.invoke('spotify:configure', id), login: () => ipcRenderer.invoke('spotify:login'), logout: () => ipcRenderer.invoke('spotify:logout'),
  status: () => ipcRenderer.invoke('spotify:status'), state: () => ipcRenderer.invoke('spotify:state'), command: (command, value) => ipcRenderer.invoke('spotify:command', command, value), devices: () => ipcRenderer.invoke('spotify:devices'),
  library: (kind, id, offset) => ipcRenderer.invoke('spotify:library', kind, id, offset),
  setInterface: (style,side)=>ipcRenderer.invoke('app:interface',style,side),
  visibility: (settings,protectedView)=>ipcRenderer.invoke('app:visibility',settings,protectedView),
  activity: ()=>ipcRenderer.send('app:activity'),
  hardware: () => ipcRenderer.invoke('app:hardware'), pin: value => ipcRenderer.invoke('app:pin', value), openExternal: url => ipcRenderer.invoke('app:open-external', url), minimize: () => ipcRenderer.invoke('app:minimize'), close: () => ipcRenderer.invoke('app:close'),
  onState: subscribe('spotify-state'), onAuth: subscribe('spotify-auth'), onDeviceEvent: subscribe('device-event'), onBridgeError: subscribe('bridge-error')
});
