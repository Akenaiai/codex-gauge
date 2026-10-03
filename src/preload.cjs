const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('gauge', {
  state: () => ipcRenderer.invoke('gauge:state'),
  action: (name, value) => ipcRenderer.invoke('gauge:action', name, value),
  onState: callback => { const listener = (_event, state) => callback(state); ipcRenderer.on('gauge:state', listener);
    return () => ipcRenderer.removeListener('gauge:state', listener); }
});
