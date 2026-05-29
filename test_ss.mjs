import { _electron as electron } from 'playwright-core';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOT_DIR = path.join(__dirname, 'test_shots');
fs.mkdirSync(SHOT_DIR, { recursive: true });

const app = await electron.launch({
  executablePath: path.join(__dirname, 'node_modules/electron/dist/electron.exe'),
  args: [__dirname],
  timeout: 30000,
});

await new Promise(r => setTimeout(r, 3500));

const noteWin = app.windows().find(w => w.url().includes('note.html'));
if (!noteWin) { console.log('no note window'); await app.close(); process.exit(1); }

// 기본 크기 (360×360)
await noteWin.screenshot({ path: path.join(SHOT_DIR, '1_default.png') });
console.log('1_default.png');

// 좁게 리사이즈 (270px 최소폭)
await app.evaluate(({ BrowserWindow }) => {
  const [win] = BrowserWindow.getAllWindows();
  win.setSize(270, 300);
}, { BrowserWindow: true });
await new Promise(r => setTimeout(r, 400));
await noteWin.screenshot({ path: path.join(SHOT_DIR, '2_narrow.png') });
console.log('2_narrow.png (270px)');

// 넓게 리사이즈 (500px)
await app.evaluate(({ BrowserWindow }) => {
  const [win] = BrowserWindow.getAllWindows();
  win.setSize(500, 360);
}, { BrowserWindow: true });
await new Promise(r => setTimeout(r, 400));
await noteWin.screenshot({ path: path.join(SHOT_DIR, '3_wide.png') });
console.log('3_wide.png (500px)');

await app.close();
