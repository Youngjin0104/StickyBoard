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

await new Promise(r => setTimeout(r, 3000));

// 두 번째 메모 추가
const noteWins0 = app.windows().filter(w => w.url().includes('note.html'));
await noteWins0[0].evaluate(() => window.noteAPI.addNote());
await new Promise(r => setTimeout(r, 1200));

// 두 창을 명확히 분리된 위치에 배치
await app.evaluate(({ BrowserWindow }) => {
  const wins = BrowserWindow.getAllWindows().filter(w => w.getTitle() === 'StickyNote');
  if (wins.length >= 2) {
    wins[0].setPosition(100, 100);  // 창A: (100,100)
    wins[1].setPosition(600, 100);  // 창B: (600,100) → 충분히 떨어짐
  }
}, { BrowserWindow: true });
await new Promise(r => setTimeout(r, 400));

// 창A를 찾아서 헤더로 드래그 시뮬레이션
const allNoteWins = app.windows().filter(w => w.url().includes('note.html'));
const pageA = allNoteWins[0];

// 창A를 오른쪽으로 드래그 (창B 쪽으로) - screenX 기준으로 이동
// 헤더의 title 영역(n-drag)을 클릭해서 드래그
await pageA.mouse.move(130, 14); // 헤더 중앙
await pageA.mouse.down();
await new Promise(r => setTimeout(r, 100));

// 400px 오른쪽으로 조금씩 드래그 (창B와 겹치는 방향)
for (let i = 0; i < 40; i++) {
  await pageA.mouse.move(130 + (i + 1) * 10, 14);
  await new Promise(r => setTimeout(r, 20));
}
await pageA.mouse.up();
await new Promise(r => setTimeout(r, 500));

// 최종 위치 확인
const positions = await app.evaluate(({ BrowserWindow }) => {
  return BrowserWindow.getAllWindows()
    .filter(w => w.getTitle() === 'StickyNote')
    .map(w => ({ pos: w.getPosition(), size: w.getSize() }));
}, { BrowserWindow: true });

console.log('\n📌 드래그 후 창 위치:');
positions.forEach((p, i) => console.log(`  창${i+1}: x=${p.pos[0]}, y=${p.pos[1]} (${p.size[0]}×${p.size[1]})`));

// 겹침 검사
let anyOverlap = false;
for (let i = 0; i < positions.length; i++) {
  for (let j = i + 1; j < positions.length; j++) {
    const a = positions[i], b = positions[j];
    const overlap =
      a.pos[0] < b.pos[0] + b.size[0] && a.pos[0] + a.size[0] > b.pos[0] &&
      a.pos[1] < b.pos[1] + b.size[1] && a.pos[1] + a.size[1] > b.pos[1];
    if (overlap) {
      console.log(`\n❌ 창${i+1}과 창${j+1}이 겹침`);
      anyOverlap = true;
    }
  }
}
if (!anyOverlap) console.log('\n✅ 겹침 없음 - 충돌 방지 정상 동작');

await pageA.screenshot({ path: path.join(SHOT_DIR, 'note.png') });
console.log('note.png saved');

await app.close();
