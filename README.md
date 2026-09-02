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

백엔드 없이 플레이 흐름을 확인하려면 다음을 설정하세요. 테스트 모드에서는 기록을 전송하거나 리더보드를 조회하지 않습니다.

```dotenv
VITE_TYPING_GAME_API_ENABLED=false
```

브라우저 콘솔에서 입력 이벤트를 확인하려면 `VITE_TYPING_GAME_DEBUG=true`를 추가하세요. 학번은 로그에 기록하지 않습니다.

## Verification

```bash
npm test -- --run
npm run test:e2e
npm run build
```

## Deployment

배포 서버는 `index.html`, `play.html`, `result.html`을 각각 독립적인 파일로 제공해야 합니다. 필요하다면 CAUSW 백엔드로 향하는 요청을 프록시하여 CORS를 처리하세요.
