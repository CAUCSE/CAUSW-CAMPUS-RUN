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

## Standalone leaderboard server

기록 서버는 SQLite를 사용하며, 시작할 때 설정을 검증하고 마이그레이션을 적용한 뒤 요청을 받습니다.

```bash
cp server/.env.example server/.env
# server/.env의 placeholder를 아래에서 생성한 값으로 모두 교체
openssl rand -base64 32 # EMAIL_ENCRYPTION_KEY
openssl rand -hex 32    # STUDENT_NUMBER_HMAC_KEY
openssl rand -hex 32    # ADMIN_TOKEN
npm --prefix server install
npm --prefix server run dev
```

프로덕션은 빌드 후 실행합니다.

```bash
npm --prefix server run build
npm --prefix server start
```

`server/.env`와 실제 비밀값은 저장소·CSV·티켓·채팅에 넣지 않습니다. `ALLOWED_ORIGINS`에는 와일드카드가 아닌 정확한 브라우저 Origin만 쉼표로 구분해 설정합니다. `PORT=0`은 OS가 사용 가능한 포트를 선택하게 하므로 테스트나 운영 플랫폼의 동적 포트 할당에 사용할 수 있습니다.

운영 시작 전 아래 설정을 확인합니다. `ALLOWED_ORIGINS`, `STUDENT_NUMBER_HMAC_KEY`, `EMAIL_ENCRYPTION_KEY`, `ADMIN_TOKEN`은 반드시 설정해야 합니다. 나머지는 기본값을 명시적으로 덮어쓸 때만 설정합니다.

| 변수 | 필요 여부 | 기본값 / 제약 |
| --- | --- | --- |
| `HOST` | 선택 | `127.0.0.1` |
| `PORT` | 선택 | `3001` (동적 포트는 `0`) |
| `DATABASE_PATH` | 선택 | `data/cau-typing.sqlite` (`npm --prefix server start` 기준 `server/data/...`) |
| `ALLOWED_ORIGINS` | 필수 | 쉼표 구분 정확한 HTTP(S) Origin |
| `STUDENT_NUMBER_HMAC_KEY` | 필수 | UTF-8 32바이트 이상 |
| `EMAIL_ENCRYPTION_KEY` | 필수 | Base64로 표현한 정확히 32바이트 AES 키 |
| `ADMIN_TOKEN` | 필수 | UTF-8 32바이트 이상 Bearer 토큰 |
| `TRUST_PROXY` | 선택 | `0`; 검토된 프록시 홉 수만 설정 |

### Public internet and reverse proxy

이 서버는 TLS 인증서 발급이나 인터넷 공개를 스스로 처리하지 않습니다. 운영자는 TLS 종료와 공개 경로를 검토된 리버스 프록시에서 관리하고, 서버는 보통 사설 인터페이스에 바인딩합니다. 프록시를 정확히 한 홉만 신뢰하는 경우에만 `TRUST_PROXY=1`로 설정하고, 직접 노출하거나 프록시 체인이 불명확하면 `0`을 유지합니다. 방화벽은 프록시만 서버 포트에 접근하도록 제한하고, 관리자 API는 별도 네트워크·접근 제어를 추가로 적용합니다.

### Backups, retention, and protected operations

SQLite WAL 모드에서는 `server/data/cau-typing.sqlite` 본체, `server/data/cau-typing.sqlite-wal`, `server/data/cau-typing.sqlite-shm`이 한 상태를 이룹니다. 실행 중에는 본체만 복사하지 말고 SQLite의 일관된 백업 기능을 사용하며, 중지 상태에서 파일을 보관할 경우에는 세 파일을 함께 취급합니다. 예를 들어 SQLite CLI가 설치된 운영 환경에서는 다음처럼 백업합니다.

```bash
mkdir -p server/backups
sqlite3 server/data/cau-typing.sqlite ".backup 'server/backups/cau-typing-$(date +%F).sqlite'"
```

백업은 암호화된 접근 제한 저장소에 보관하고, 복구 절차를 정기적으로 시험합니다. 보관 기간은 대회 목적·학내 정책·동의 고지에 맞춰 정한 뒤, 만료 시 아래 전체 삭제 절차를 사용합니다. 현재 API에는 자동 보존 정책이나 선택적 삭제 기능이 없으므로, 필요한 기간이 끝나면 운영자가 백업 여부를 확인하고 수동으로 파기해야 합니다.

CSV 내보내기와 전체 삭제는 `ADMIN_TOKEN` Bearer 인증이 필요하며, CSV에는 연락처 정보가 포함됩니다. 토큰은 셸의 안전한 환경변수나 비밀 관리자에서만 주입하고, 다운로드 파일도 접근 제한·암호화·보관 기한을 적용합니다.

```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" http://127.0.0.1:3001/api/v2/admin/campus-typing/records.csv --output campus-typing-records.csv

curl -X DELETE -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  --data '{"confirmation":"DELETE ALL CAMPUS TYPING DATA"}' \
  http://127.0.0.1:3001/api/v2/admin/campus-typing/records
```

두 번째 요청은 되돌릴 수 없는 전체 파기입니다. 실행 전 검증된 백업과 승인 절차를 확인하고, `ADMIN_TOKEN`은 명령 기록에 남기지 않도록 안전한 비밀 주입 방식으로 설정합니다.

### 개인정보 및 발송 대행 주의

공개 전에 SendB 계약이 ㈜윈큐브마케팅을 처리 수탁자(processor)로 보는지 제3자 제공 수령자(third-party recipient)로 보는지 반드시 확인합니다. 계약, 데이터 흐름, 보관·재위탁 조건에 따라 실제 분류가 달라질 수 있으므로 개인정보 담당 부서와 법률 자문으로 동의 문구를 확정합니다. 고지 문구가 바뀌면 동의 버전을 수정·증가시키고 새 버전을 배포해야 합니다.

### Operator handoff checklist

- [ ] `server/.env` 또는 배포 비밀 저장소에 필수 네 값을 설정했고, 키와 SQLite 백업을 함께 접근 제한 저장소에 보관했다.
- [ ] `npm --prefix server run build` 후 `npm --prefix server start`로 시작해, 시작 시 마이그레이션이 적용되는 것을 확인했다.
- [ ] 운영 프록시의 TLS, 접근 제어, `ALLOWED_ORIGINS`, `TRUST_PROXY`를 실제 네트워크 경계와 맞췄다.
- [ ] CSV 접근 권한·보관 기한과 전체 삭제 승인자를 지정했고, 복구 절차를 시험했다.
- [ ] ㈜윈큐브마케팅의 법적 역할과 동의 고지/버전을 출시 전에 확정했다.
