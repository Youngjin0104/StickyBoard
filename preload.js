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
  onTitleUpdate:  (cb) => ipcRenderer.on('note-title-updated', (_, title) => cb(title)),
  onShadeChanged: (cb) => ipcRenderer.on('note-shade-changed', (_, shaded) => cb(shaded)),
  getNotesDir:    () => ipcRenderer.invoke('get-notes-dir'),
  changeNotesDir: () => ipcRenderer.invoke('change-notes-dir'),
  importTxt:      () => ipcRenderer.invoke('import-txt'),
  openList:       () => ipcRenderer.send('open-list'),
  setOpacity:     (id, val) => ipcRenderer.invoke('note-set-opacity', id, val),
  toggleShade:    (id) => ipcRenderer.invoke('note-toggle-shade', id),
  moveWindowBy:   (id, dx, dy) => ipcRenderer.send('note-move-by', id, dx, dy),
  dragStart:      (id) => ipcRenderer.send('note-drag-start', id),
  dragEnd:        (id) => ipcRenderer.send('note-drag-end', id),
});
