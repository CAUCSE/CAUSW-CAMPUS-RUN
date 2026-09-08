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

### Public internet and reverse proxy

이 서버는 TLS 인증서 발급이나 인터넷 공개를 스스로 처리하지 않습니다. 운영자는 TLS 종료와 공개 경로를 검토된 리버스 프록시에서 관리하고, 서버는 보통 사설 인터페이스에 바인딩합니다. 프록시를 정확히 한 홉만 신뢰하는 경우에만 `TRUST_PROXY=1`로 설정하고, 직접 노출하거나 프록시 체인이 불명확하면 `0`을 유지합니다. 방화벽은 프록시만 서버 포트에 접근하도록 제한하고, 관리자 API는 별도 네트워크·접근 제어를 추가로 적용합니다.

### Backups, retention, and protected operations

SQLite 파일은 서비스가 중지된 상태에서 보관하거나 SQLite의 일관된 백업 기능으로 복제합니다. 예를 들어 SQLite CLI가 설치된 운영 환경에서는 다음처럼 백업합니다.

```bash
mkdir -p server/backups
sqlite3 server/data/cau-typing.sqlite ".backup 'server/backups/cau-typing-$(date +%F).sqlite'"
```

백업은 암호화된 접근 제한 저장소에 보관하고, 복구 절차를 정기적으로 시험합니다. 보관 기간은 대회 목적·학내 정책·동의 고지에 맞춰 정한 뒤, 만료 시 아래 전체 삭제 절차를 사용합니다. 현재 API에는 자동 보존 정책이나 선택적 삭제 기능이 없으므로, 필요한 기간이 끝나면 운영자가 백업 여부를 확인하고 수동으로 파기해야 합니다.

CSV 내보내기와 전체 삭제는 `ADMIN_TOKEN` Bearer 인증이 필요하며, CSV에는 연락처 정보가 포함됩니다. 토큰은 셸의 안전한 환경변수나 비밀 관리자에서만 주입하고, 다운로드 파일도 접근 제한·암호화·보관 기한을 적용합니다.

```bash
# ADMIN_TOKEN은 명령 기록에 남기지 않도록 안전한 비밀 주입 방식으로 설정한다.
curl --fail --show-error \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -o campus-typing-records.csv \
  https://typing.example/api/v2/admin/campus-typing/records.csv

# 되돌릴 수 없는 전체 파기: 먼저 검증된 백업과 승인 절차를 갖춘다.
curl --fail --show-error --request DELETE \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"confirmation":"DELETE ALL CAMPUS TYPING DATA"}' \
  https://typing.example/api/v2/admin/campus-typing/records
```

### 개인정보 및 발송 대행 주의

SendB 같은 문자 발송사가 계약에 따라 학교의 지시만 받아 발송을 대행하고 자체 목적 사용을 하지 않는다면 일반적으로 처리위탁으로 검토할 여지가 있습니다. 반대로 수신자 정보가 그 사업자의 독자적 목적 또는 별도 수익·마케팅 목적으로 전달되면 제3자 제공으로 볼 수 있어 별도 고지·동의가 필요할 수 있습니다. 실제 계약, 데이터 흐름, 보관·재위탁 조건에 따라 결론이 달라지므로 공개 전 개인정보 담당 부서와 법률 자문으로 분류·동의 문구를 확정해야 합니다.
