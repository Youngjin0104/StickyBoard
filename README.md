# 📌 StickyBoard — Electron 위젯 설치 가이드

## 구조
```
electron-app/
├── main.js          ← Electron 메인 프로세스
├── preload.js       ← 렌더러 ↔ 메인 IPC 브릿지
├── stickyboard.html ← 앱 UI (웹 단독 실행도 가능)
├── package.json     ← 의존성 설정
└── README.md
```

---

## 1단계 — Node.js 설치 (이미 있으면 생략)

https://nodejs.org 에서 **LTS** 버전 다운로드 후 설치.

```bash
node -v   # v18 이상 권장
npm -v
```

---

## 2단계 — 의존성 설치

```bash
cd electron-app
npm install
```

> 내부망이라 npm registry 접근이 안 될 경우:
> - npm config에 사내 proxy 설정
> - 또는 외부망 PC에서 `npm install` 후 `node_modules` 폴더째 복사

---

## 3단계 — 실행 (개발/테스트)

```bash
npm start
```

---

## 4단계 — Windows .exe 빌드 및 배포

```bash
npm run build:win
```

빌드 완료 후 `dist/` 폴더에 설치 파일이 생성됩니다:
- `StickyBoard Setup x.x.x.exe` → 설치 프로그램
- 설치 후 바탕화면/시작메뉴 바로가기 자동 생성

---

## 위젯 기능 설명

| 기능 | 방법 |
|------|------|
| **트레이 상주** | 닫기(✕) 클릭 시 트레이로 숨김, 완전 종료 안 됨 |
| **다시 열기** | 트레이 아이콘 더블클릭 |
| **항상 위에 표시** | 타이틀바 📌 버튼 클릭 or 트레이 우클릭 메뉴 |
| **최소화** | 타이틀바 ─ 버튼 |
| **완전 종료** | 트레이 우클릭 → "완전히 종료" |
| **데이터 저장** | 자동 (localStorage, 브라우저와 별도 저장공간) |

---

## Windows 시작 시 자동 실행 등록 (선택)

`main.js`의 `app.whenReady()` 안에 아래 코드 추가:

```js
// 시작 프로그램 등록/해제
app.setLoginItemSettings({
  openAtLogin: true,
  path: app.getPath('exe'),
});
```

---

## 브라우저에서도 사용 가능

`stickyboard.html`을 웹서버에 올리거나 파일로 열면
Electron 버튼(📌─□✕)은 자동으로 숨겨지고,
순수 웹 앱으로 동작합니다.
