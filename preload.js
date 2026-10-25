const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('pet', {
  onData: (cb) => ipcRenderer.on('data', (e, d) => cb(d)),
  onCfg: (cb) => ipcRenderer.on('cfg', (e, d) => cb(d)),
  onOpenSettings: (cb) => ipcRenderer.on('openSettings', () => cb()),
  onPing: (cb) => ipcRenderer.on('ping', () => cb()),
  refresh: () => ipcRenderer.invoke('balance'),
  dragStart: (p) => ipcRenderer.send('drag:start', p),
  dragMove: (p) => ipcRenderer.send('drag:move', p),
  dragEnd: () => ipcRenderer.send('drag:end'),
  ignore: (f) => ipcRenderer.send('ignore', f),
  hit: (r) => ipcRenderer.send('hit', r),
  resize: (w) => ipcRenderer.send('resize', w),
  quit: () => ipcRenderer.send('quit'),
  menu: () => ipcRenderer.send('menu')
});
