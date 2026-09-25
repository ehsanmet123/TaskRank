const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('taskrankDesktop', {
  getState: () => ipcRenderer.invoke('widget:get-state'),
  sync: () => ipcRenderer.invoke('widget:sync'),
  complete: id => ipcRenderer.invoke('widget:complete', id),
  restore: id => ipcRenderer.invoke('widget:restore', id),
  create: title => ipcRenderer.invoke('widget:create', title),
  rename: (id, title) => ipcRenderer.invoke('widget:rename', id, title),
  setToday: (id, selected) => ipcRenderer.invoke('widget:today', id, selected),
  delete: id => ipcRenderer.invoke('widget:delete', id),
  reorder: (id, direction) => ipcRenderer.invoke('widget:reorder', id, direction),
  close: () => ipcRenderer.send('widget:close'),
  minimize: () => ipcRenderer.send('widget:minimize'),
  connectGoogle: () => ipcRenderer.invoke('auth:google'),
  onState: listener => ipcRenderer.on('widget:state', (_event, state) => listener(state)),
});
