# CAU Campus Typing Game

18개의 중앙대학교 캠퍼스 장소를 빠르게 입력해 기록을 겨루는 멀티페이지 웹 게임입니다.

## Requirements

Node.js 22.12 이상이 필요합니다.

## Local development

```bash
npm install
cp .env.example .env.local
npm run dev
```

`.env.local`에서 `VITE_TYPING_GAME_API_BASE_URL`을 CAUSW 백엔드 주소로 변경할 수 있습니다.

## Verification

```bash
npm test -- --run
npm run test:e2e
npm run build
```

## Deployment

배포 서버는 `index.html`, `play.html`, `result.html`을 각각 독립적인 파일로 제공해야 합니다. 필요하다면 CAUSW 백엔드로 향하는 요청을 프록시하여 CORS를 처리하세요.
