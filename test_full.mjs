import { _electron as electron } from 'playwright-core';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOT = (n) => path.join(__dirname, 'test_shots', n + '.png');
fs.mkdirSync(path.join(__dirname, 'test_shots'), { recursive: true });

const app = await electron.launch({
  executablePath: path.join(__dirname, 'node_modules/electron/dist/electron.exe'),
  args: [__dirname],
  timeout: 30000,
});
await new Promise(r => setTimeout(r, 3000));

const noteWin = app.windows().find(w => w.url().includes('note.html'));
if (!noteWin) { console.log('❌ note 창 없음'); await app.close(); process.exit(1); }

// ── 1. 기본 UI 확인
await noteWin.screenshot({ path: SHOT('A_default') });
console.log('▶ A_default.png');

// 헤더 버튼 존재 확인
const buttons = await noteWin.evaluate(() => ({
  new:     !!document.getElementById('btn-new'),
  shade:   !!document.getElementById('btn-shade'),
  cp:      !!document.getElementById('btn-cp'),
  opacity: !!document.getElementById('btn-opacity'),
  list:    !!document.getElementById('btn-list'),
  close:   !!document.getElementById('btn-close'),
}));
console.log('헤더 버튼:', buttons);
const missing = Object.entries(buttons).filter(([,v]) => !v).map(([k]) => k);
if (missing.length) console.log('❌ 없는 버튼:', missing);
else console.log('✅ 모든 헤더 버튼 존재');

// ── 2. 배경 워터마크 확인
const hasBg = await noteWin.evaluate(() => {
  const style = getComputedStyle(document.getElementById('n-body'), '::before');
  return style.backgroundImage.includes('noteit.png');
});
console.log(hasBg ? '✅ 워터마크 적용됨' : '❌ 워터마크 없음');

// ── 3. 접기 버튼 테스트
await noteWin.evaluate(() => document.getElementById('btn-shade').click());
await new Promise(r => setTimeout(r, 400));
await noteWin.screenshot({ path: SHOT('B_shaded') });
console.log('▶ B_shaded.png');

const isShaded = await noteWin.evaluate(() =>
  document.getElementById('note').classList.contains('is-shaded')
);
console.log(isShaded ? '✅ 접기 동작함' : '❌ 접기 안 됨');

// 펼치기
await noteWin.evaluate(() => document.getElementById('btn-shade').click());
await new Promise(r => setTimeout(r, 400));
await noteWin.screenshot({ path: SHOT('C_unshaded') });
console.log('▶ C_unshaded.png');

const isUnshaded = await noteWin.evaluate(() =>
  !document.getElementById('note').classList.contains('is-shaded')
);
console.log(isUnshaded ? '✅ 펼치기 동작함' : '❌ 펼치기 안 됨');

// ── 4. 두 번째 창 생성 후 헤더 충돌 테스트
await noteWin.evaluate(() => window.noteAPI.addNote());
await new Promise(r => setTimeout(r, 1200));

const noteWins = app.windows().filter(w => w.url().includes('note.html'));
console.log(`\n메모 창 수: ${noteWins.length}`);

// 두 창을 같은 위치에 놓기
await app.evaluate(({ BrowserWindow }) => {
  const wins = BrowserWindow.getAllWindows().filter(w => w.getTitle() === 'StickyNote');
  wins[0]?.setPosition(200, 200);
  wins[1]?.setPosition(200, 200);
}, { BrowserWindow: true });
await new Promise(r => setTimeout(r, 300));

// note-move-by IPC로 드래그 시뮬레이션 (창0을 오른쪽으로 이동)
const id0 = await noteWins[0].evaluate(() =>
  new URLSearchParams(window.location.search).get('id')
);
await noteWins[0].evaluate((id) => window.noteAPI.moveWindowBy(id, 1, 0), id0);
await new Promise(r => setTimeout(r, 200));

const positions = await app.evaluate(({ BrowserWindow }) =>
  BrowserWindow.getAllWindows()
    .filter(w => w.getTitle() === 'StickyNote')
    .map(w => ({ pos: w.getPosition(), size: w.getSize() }))
, { BrowserWindow: true });

console.log('\n드래그 후 창 위치:');
positions.forEach((p, i) =>
  console.log(`  창${i+1}: x=${p.pos[0]}, y=${p.pos[1]}, w=${p.size[0]}, h=${p.size[1]}`)
);

// 헤더 겹침 검사
const HDRH = 28;
let overlap = false;
for (let i = 0; i < positions.length; i++) {
  for (let j = i+1; j < positions.length; j++) {
    const a = positions[i], b = positions[j];
    const hdrOverlap =
      a.pos[0] < b.pos[0] + b.size[0] && a.pos[0] + a.size[0] > b.pos[0] &&
      a.pos[1] < b.pos[1] + HDRH && a.pos[1] + HDRH > b.pos[1];
    if (hdrOverlap) { console.log(`❌ 창${i+1}-창${j+1} 헤더 겹침`); overlap = true; }
  }
}
if (!overlap) console.log('✅ 헤더 겹침 없음');

// 사이즈 변화 여부 확인 (드래그 전후 비교)
const sizes = positions.map(p => `${p.size[0]}x${p.size[1]}`);
const uniqueSizes = [...new Set(sizes)];
console.log('\n창 사이즈:', sizes.join(', '));
if (uniqueSizes.length > 1) console.log('⚠ 사이즈 불일치 (DPI 스케일 차이일 수 있음)');
else console.log('✅ 모든 창 사이즈 동일');

await noteWins[0].screenshot({ path: SHOT('D_two_notes') });
console.log('▶ D_two_notes.png');

await app.close();
console.log('\n완료');
