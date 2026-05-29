'use strict';
const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, globalShortcut, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let tray, listWindow;
const noteWindows = new Map();
const shadeMap    = new Map();

/* ── 저장소 ── */
function configPath()    { return path.join(app.getPath('userData'), 'config.json'); }
function loadConfig()    { try { return JSON.parse(fs.readFileSync(configPath(), 'utf8')); } catch { return {}; } }
function saveConfig(cfg) { fs.writeFileSync(configPath(), JSON.stringify(cfg)); }
function getNotesDir() {
  const cfg = loadConfig();
  if (cfg.notesDir) { try { fs.accessSync(cfg.notesDir); return cfg.notesDir; } catch {} }
  return app.getPath('userData');
}
function metaPath()    { return path.join(getNotesDir(), 'notes_meta.json'); }
function cPath(name)   { return path.join(getNotesDir(), name); }
function uid()         { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function htmlToText(html) {
  return (html || '')
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, inner) => {
      const content = inner
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/\n/g, '\n  ');
      return '\n- ' + content;
    })
    .replace(/<\/ul>/gi, '\n').replace(/<\/ol>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n  ').replace(/<\/div>/gi, '\n').replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
    .replace(/\n{3,}/g,'\n\n').trim();
}

function sanitize(title) {
  return (title||'').replace(/[\\/:*?"<>|\r\n\t]/g,'').trim() || '메모';
}

function loadMeta()      { try { return JSON.parse(fs.readFileSync(metaPath(),'utf8')); } catch { return []; } }
function saveMeta(arr)   { fs.writeFileSync(metaPath(), JSON.stringify(arr, null, 2), 'utf8'); }

/* 중복 없는 파일명 생성 */
function uniqueFilename(title, excludeId, metaArr) {
  const base = sanitize(title || '메모');
  const arr  = metaArr || loadMeta();
  let name = `${base}.txt`, i = 1;
  while (arr.some(m => m.filename === name && m.id !== excludeId))
    name = `${base}(${i++}).txt`;
  return name;
}

/* txt 내용 쓰기 (내용만, 설정 없음) */
function writeContent(filename, note) {
  const body = note.mode === 'checklist'
    ? (note.items||[]).map(it=>`${it.done?'[x]':'[ ]'} ${it.text}`).join('\n')
    : htmlToText(note.content||'');
  fs.writeFileSync(cPath(filename), body, 'utf8');
}

/* txt 내용 읽기 */
function readContent(filename, mode) {
  try {
    const raw = fs.readFileSync(cPath(filename), 'utf8');
    if (mode === 'checklist') {
      return { content:'', items: raw.split('\n').filter(l=>l.trim()).map(l=>({
        done: l.trim().startsWith('[x]'),
        text: l.trim().replace(/^\[[ x]\]\s*/,''),
      }))};
    }
    return { content: raw, items: [] };
  } catch { return { content:'', items:[] }; }
}

function loadNotes() {
  migrateIfNeeded();
  return loadMeta().map(m => ({ ...m, ...readContent(m.filename, m.mode) }));
}

function patchNote(id, changes) {
  const meta = loadMeta();
  const idx  = meta.findIndex(m => m.id === id);
  if (idx === -1) return;

  /* 타이틀 변경 → 파일 이름 변경 */
  if ('title' in changes && sanitize(changes.title) !== sanitize(meta[idx].title)) {
    const newName = uniqueFilename(changes.title, id, meta);
    try { fs.renameSync(cPath(meta[idx].filename), cPath(newName)); } catch {}
    meta[idx].filename = newName;
  }

  /* 메타 갱신 */
  ['title','color','mode','x','y','w','h','pinned','opacity','ts'].forEach(k => {
    if (k in changes) meta[idx][k] = changes[k];
  });
  saveMeta(meta);

  /* 내용 갱신 */
  if ('content' in changes || 'items' in changes || 'mode' in changes) {
    const m    = meta[idx];
    const cur  = readContent(m.filename, m.mode);
    writeContent(m.filename, {
      mode:    changes.mode    ?? m.mode,
      content: changes.content ?? cur.content,
      items:   changes.items   ?? cur.items,
    });
  }
}

/* ── 구버전 마이그레이션 (1회) ── */
function migrateIfNeeded() {
  const dir = getNotesDir();
  if (fs.existsSync(metaPath())) return;

  const oldNotes = [];

  /* v2: notes_index.json */
  const idxFile = path.join(dir, 'notes_index.json');
  if (fs.existsSync(idxFile)) {
    try {
      const idx = JSON.parse(fs.readFileSync(idxFile,'utf8'));
      idx.forEach(m => {
        try { m.content = fs.readFileSync(path.join(dir,`${m.id}.txt`),'utf8'); } catch {}
        oldNotes.push(m);
      });
      fs.renameSync(idxFile, idxFile+'.bak');
    } catch {}
  }

  /* v3: {id}.txt with frontmatter */
  if (!oldNotes.length) {
    try {
      fs.readdirSync(dir).filter(f=>f.endsWith('.txt')).forEach(f => {
        const raw = fs.readFileSync(path.join(dir,f),'utf8');
        if (!raw.startsWith('---\n')) return;
        const end = raw.indexOf('\n---\n',4); if (end===-1) return;
        const fm={};
        raw.slice(4,end).split('\n').forEach(line=>{
          const ci=line.indexOf(':'); if(ci<0) return;
          let v=line.slice(ci+1).trim();
          if(v==='true') v=true; else if(v==='false') v=false; else if(v!==''&&!isNaN(v)) v=Number(v);
          fm[line.slice(0,ci).trim()]=v;
        });
        const body=raw.slice(end+5), id=path.basename(f,'.txt');
        const items=fm.mode==='checklist'?body.split('\n').filter(l=>l.trim()).map(l=>({
          done:l.trim().startsWith('[x]'), text:l.trim().replace(/^\[[ x]\]\s*/,'')
        })):[];
        oldNotes.push({id, content:fm.mode!=='checklist'?body:'', items, ...fm});
      });
    } catch {}
  }

  /* v1: notes.json */
  if (!oldNotes.length) {
    const oldJson = path.join(dir,'notes.json');
    if (fs.existsSync(oldJson)) {
      try {
        const arr=JSON.parse(fs.readFileSync(oldJson,'utf8'));
        if(Array.isArray(arr)){oldNotes.push(...arr);fs.renameSync(oldJson,oldJson+'.bak');}
      } catch {}
    }
  }

  if (!oldNotes.length) return;

  const newMeta = [];
  oldNotes.forEach(n => {
    const id  = n.id || uid();
    const fn  = uniqueFilename(n.title, id, newMeta);
    newMeta.push({ id, filename:fn, title:n.title||'', color:n.color||'yellow',
      mode:n.mode||'text', x:n.x||100, y:n.y||100, w:n.w||240, h:n.h||240,
      pinned:n.pinned||false, ts:n.ts||Date.now() });
    writeContent(fn, { mode:n.mode||'text', content:n.content||'', items:n.items||[] });
  });
  saveMeta(newMeta);

  /* 구버전 frontmatter txt 파일 숨기기 */
  try {
    fs.readdirSync(dir).filter(f=>f.endsWith('.txt')).forEach(f => {
      if (newMeta.some(m=>m.filename===f)) return;
      const raw=fs.readFileSync(path.join(dir,f),'utf8');
      if (raw.startsWith('---\n')) fs.renameSync(path.join(dir,f),path.join(dir,f)+'.bak');
    });
  } catch {}
}

function notifyListWindow() {
  if (listWindow && !listWindow.isDestroyed()) {
    const notes = loadNotes().map(n => {
      const w = noteWindows.get(n.id);
      return { ...n, visible: w ? (!w.isDestroyed() && w.isVisible()) : false };
    });
    listWindow.webContents.send('notes-updated', notes);
  }
}

/* ── 노트 창 ── */
function toggleShadeState(id) {
  const next = !shadeMap.has(id);
  if (next) shadeMap.set(id, true); else shadeMap.delete(id);
  const win = noteWindows.get(id);
  if (win && !win.isDestroyed()) win.webContents.send('note-shade-changed', next);
  return next;
}

function createNoteWindow(note) {
  const win = new BrowserWindow({
    x: note.x ?? 100, y: note.y ?? 100,
    width: note.w ?? 240, height: note.h ?? 240,
    minWidth: 180, minHeight: 160,
    frame: false, transparent: true, backgroundColor: '#00000000',
    skipTaskbar: true, icon: path.join(__dirname, 'noteit.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false,
    },
    show: false, title: 'StickyNote',
  });

  win.loadFile('note.html', { query: { id: note.id } });
  win.once('ready-to-show', () => {
    if (note.opacity && note.opacity !== 1) win.setOpacity(note.opacity);
    win.show();
    notifyListWindow();
  });

  /* 닫기(×) → 숨기기, 종료 시에만 실제 닫기 */
  win.on('close', (e) => {
    if (!app.isQuitting) { e.preventDefault(); win.hide(); notifyListWindow(); }
  });

  let moveTimer, resizeTimer;
  win.on('move', () => {
    clearTimeout(moveTimer);
    moveTimer = setTimeout(() => {
      if (!win.isDestroyed()) { const [x,y] = win.getPosition(); patchNote(note.id, {x,y}); }
    }, 400);
  });
  win.on('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (!win.isDestroyed()) { const [w,h] = win.getSize(); patchNote(note.id, {w,h}); }
    }, 400);
  });

  win.on('closed', () => noteWindows.delete(note.id));
  noteWindows.set(note.id, win);
  return win;
}

/* ── 메모 목록 창 ── */
function openListWindow() {
  if (listWindow && !listWindow.isDestroyed()) { listWindow.show(); listWindow.focus(); return; }
  listWindow = new BrowserWindow({
    width: 290, height: 480,
    frame: false, resizable: false, icon: path.join(__dirname, 'noteit.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false,
    },
    show: false, title: 'StickyBoard',
    backgroundColor: '#1e293b',
  });
  listWindow.loadFile('list.html');
  listWindow.once('ready-to-show', () => { listWindow.show(); notifyListWindow(); });
  listWindow.on('closed', () => { listWindow = null; });
}

/* ── IPC ── */
ipcMain.on('win-close',    (e) => BrowserWindow.fromWebContents(e.sender)?.close());
ipcMain.on('win-minimize', (e) => BrowserWindow.fromWebContents(e.sender)?.minimize());
ipcMain.on('open-list',    () => openListWindow());

ipcMain.handle('note-get',    (_, id) => loadNotes().find(n => n.id === id) || null);
ipcMain.handle('note-update', (_, id, changes) => {
  patchNote(id, changes);
  notifyListWindow();
  if ('title' in changes) {
    const win = noteWindows.get(id);
    if (win && !win.isDestroyed()) win.webContents.send('note-title-updated', changes.title);
  }
});
ipcMain.handle('note-toggle-shade', (_, id) => toggleShadeState(id));
ipcMain.handle('note-delete', (_, id) => {
  const meta  = loadMeta();
  const entry = meta.find(m => m.id === id);
  if (entry) {
    try { fs.unlinkSync(cPath(entry.filename)); } catch {}
    saveMeta(meta.filter(m => m.id !== id));
  }
  const win = noteWindows.get(id);
  if (win && !win.isDestroyed()) win.destroy();
  noteWindows.delete(id);
  notifyListWindow();
});

ipcMain.handle('note-set-opacity', (e, id, val) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (win && !win.isDestroyed()) win.setOpacity(Math.max(0.1, Math.min(1, val)));
  patchNote(id, { opacity: val });
});

ipcMain.handle('get-notes-dir', () => getNotesDir());
ipcMain.handle('change-notes-dir', async (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const result = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
  if (result.canceled || !result.filePaths.length) return null;
  const newDir = result.filePaths[0];
  const cfg = loadConfig(); cfg.notesDir = newDir; saveConfig(cfg);
  noteWindows.forEach(w => { if (!w.isDestroyed()) w.destroy(); });
  noteWindows.clear();
  loadNotes().forEach(createNoteWindow);
  setTimeout(notifyListWindow, 300);
  return newDir;
});

ipcMain.handle('import-txt', async (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const result = await dialog.showOpenDialog(win, {
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Text Files', extensions: ['txt'] }],
  });
  if (result.canceled || !result.filePaths.length) return 0;
  for (const filePath of result.filePaths) {
    const raw   = fs.readFileSync(filePath, 'utf8');
    const title = path.basename(filePath, '.txt');
    const id    = uid();
    const lines = raw.split('\n').filter(l=>l.trim());
    const isCk  = lines.length > 0 && lines.every(l=>/^\[[ x]\]/.test(l.trim()));
    const mode  = isCk ? 'checklist' : 'text';
    const note  = {
      id, title, color:'yellow', mode, pinned:false,
      x:80+Math.floor(Math.random()*300), y:80+Math.floor(Math.random()*200),
      w:240, h:240, ts:Date.now(),
      content: isCk ? '' : raw,
      items: isCk ? lines.map(l=>({ done:l.trim().startsWith('[x]'), text:l.trim().replace(/^\[[ x]\]\s*/,'') })) : [],
    };
    const meta     = loadMeta();
    const filename = uniqueFilename(title, id, meta);
    meta.push({ id, filename, title, color:'yellow', mode, x:note.x, y:note.y, w:note.w, h:note.h, pinned:false, ts:note.ts });
    saveMeta(meta);
    writeContent(filename, note);
    createNoteWindow(note);
  }
  setTimeout(notifyListWindow, 300);
  return result.filePaths.length;
});

ipcMain.handle('notes-get-all', () => {
  return loadNotes().map(n => {
    const w = noteWindows.get(n.id);
    return { ...n, visible: w ? (!w.isDestroyed() && w.isVisible()) : false };
  });
});
ipcMain.handle('note-focus', (_, id) => {
  const win = noteWindows.get(id);
  if (win && !win.isDestroyed()) { win.show(); win.focus(); }
  notifyListWindow();
});
ipcMain.handle('note-add', () => addNote());

/* ── 새 메모 ── */
function addNote() {
  const id   = uid();
  const note = {
    id, title:'', color:'yellow', mode:'text', content:'', items:[],
    x:80+Math.floor(Math.random()*300), y:80+Math.floor(Math.random()*200),
    w:240, h:240, ts:Date.now(), pinned:false,
  };
  const meta     = loadMeta();
  const filename = uniqueFilename('', id, meta);
  meta.push({ id, filename, title:'', color:'yellow', mode:'text',
    x:note.x, y:note.y, w:note.w, h:note.h, pinned:false, ts:note.ts });
  saveMeta(meta);
  writeContent(filename, note);
  createNoteWindow(note);
}

/* ── 단일 인스턴스 ── */
if (!app.requestSingleInstanceLock()) { app.quit(); }
app.on('second-instance', () => { openListWindow(); });

/* ── 앱 시작 ── */
app.whenReady().then(() => {
  const notes = loadNotes();
  if (notes.length === 0) addNote();
  else notes.forEach(createNoteWindow);
  createTray();
  globalShortcut.register('CommandOrControl+N', addNote);
});

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'noteit.png')).resize({ width: 16, height: 16, quality: 'best' });
  tray = new Tray(icon);
  tray.setToolTip('StickyBoard');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '새 메모 (Ctrl+N)', click: addNote },
    { label: '메모 목록', click: openListWindow },
    { type: 'separator' },
    { label: '완전히 종료', click: () => { app.isQuitting = true; app.quit(); } },
  ]));
  tray.on('double-click', openListWindow);
}

app.on('window-all-closed', (e) => e.preventDefault());
app.on('before-quit', () => { app.isQuitting = true; });
app.on('will-quit', () => globalShortcut.unregisterAll());
