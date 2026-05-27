'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('noteAPI', {
  close:          () => ipcRenderer.send('win-close'),
  minimize:       () => ipcRenderer.send('win-minimize'),
  getData:        (id) => ipcRenderer.invoke('note-get', id),
  update:         (id, changes) => ipcRenderer.invoke('note-update', id, changes),
  delete:         (id) => ipcRenderer.invoke('note-delete', id),
  getAll:         () => ipcRenderer.invoke('notes-get-all'),
  focus:          (id) => ipcRenderer.invoke('note-focus', id),
  addNote:        () => ipcRenderer.invoke('note-add'),
  onUpdate:       (cb) => ipcRenderer.on('notes-updated', (_, notes) => cb(notes)),
  getNotesDir:    () => ipcRenderer.invoke('get-notes-dir'),
  changeNotesDir: () => ipcRenderer.invoke('change-notes-dir'),
  importTxt:      () => ipcRenderer.invoke('import-txt'),
  openList:       () => ipcRenderer.send('open-list'),
  setOpacity:     (id, val) => ipcRenderer.invoke('note-set-opacity', id, val),
});
