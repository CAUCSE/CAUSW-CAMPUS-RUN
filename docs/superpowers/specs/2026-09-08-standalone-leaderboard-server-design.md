# 독립 리더보드 저장 서버 설계

## 목적

CAU Campus Typing Game의 세션 생성, 기록 저장, 공개 리더보드와 운영자용 연락처 CSV를 현재 저장소 안의 독립 서버로 제공한다. 서버는 단일 노트북에서 Node.js 프로세스로 실행하고 SQLite 파일 하나에 데이터를 보관한다.

배포 자동화, 도메인, TLS 종료, 리버스 프록시와 터널 구성은 이 작업에 포함하지 않는다. 서버는 공개 인터넷 뒤에서 운영할 수 있도록 Origin 제한, 요청 제한, 개인정보 암호화와 관리자 인증을 자체적으로 제공한다.

## 확정된 제품 규칙

- 학번, 별명, 이메일과 휴대전화번호를 입력해야 게임을 시작할 수 있다.
- 이메일과 휴대전화번호는 경품 추첨·연락·발송 목적으로만 사용하며 공개 응답과 애플리케이션 로그에 포함하지 않는다.
- 개인정보 수집·이용과 센드비를 통한 경품 발송에 각각 동의해야 게임을 시작할 수 있다.
- 리더보드에는 학번별 최고 기록 하나만 노출한다.
- 최고 기록이 아닌 도전 기록도 운영 종료 전까지 보관한다.
- 서버가 세션 시작 시각과 완료 요청 수신 시각으로 공식 기록을 계산한다.
- 코스는 모든 사용자에게 같은 18개 장소를 같은 순서로 제공하며 `100주년기념관`에서 끝난다.
- 관리자 토큰으로 보호된 CSV 다운로드와 전체 데이터 삭제 API를 제공한다.

## 저장소 구조

프론트와 서버는 같은 Git 저장소에 두되 빌드와 실행 경계를 분리한다.

```text
cau-typy/
├── src/                         # 기존 React 프론트
├── server/
│   ├── src/
│   │   ├── routes/
│   │   │   ├── sessions.ts
│   │   │   ├── leaderboard.ts
│   │   │   └── admin.ts
│   │   ├── database/
│   │   │   ├── connection.ts
│   │   │   ├── migrations.ts
│   │   │   └── repositories.ts
│   │   ├── security/
│   │   │   ├── identity.ts
│   │   │   ├── contact-encryption.ts
│   │   │   └── admin-auth.ts
│   │   ├── config.ts
│   │   ├── app.ts
│   │   └── main.ts
│   ├── migrations/
│   ├── test/
│   ├── package.json
│   └── tsconfig.json
├── data/                        # Git에서 제외하는 SQLite 저장 경로
└── package.json                 # 프론트와 서버 공통 실행 스크립트
```

`server`는 Fastify 애플리케이션이며 프론트 정적 파일을 제공하지 않는다. 루트 프로젝트에는 서버 개발·테스트·빌드·실행 명령과 프론트 및 서버 테스트를 함께 실행하는 검증 명령을 추가한다.

## 환경 설정

서버는 다음 환경변수를 시작 시 검증한다. 누락되거나 형식이 잘못되면 요청을 받기 전에 종료한다.

| 이름 | 의미 |
| --- | --- |
| `PORT` | HTTP 수신 포트. 기본값 `3001` |
| `HOST` | 바인딩 주소. 기본값 `127.0.0.1` |
| `DATABASE_PATH` | SQLite 파일 경로. 기본값 `data/cau-typing.sqlite` |
| `ALLOWED_ORIGINS` | 쉼표로 구분한 프론트 Origin 목록 |
| `STUDENT_NUMBER_HMAC_KEY` | 최소 32바이트 HMAC 비밀키 |
| `EMAIL_ENCRYPTION_KEY` | Base64로 표현한 정확히 32바이트 AES 키 |
| `ADMIN_TOKEN` | 최소 32자의 관리자 Bearer 토큰 |
| `TRUST_PROXY` | 신뢰할 리버스 프록시 홉 수. 기본값 `0` |

개발용 예시는 `server/.env.example`에 가짜 값과 생성 방법만 기록한다. 실제 비밀값과 `.env`, SQLite 본체 및 WAL 관련 파일은 Git에 포함하지 않는다.

## 데이터 모델

SQLite는 foreign key와 WAL 모드를 활성화하고 5초 busy timeout을 사용한다. 서버 시작 시 번호가 매겨진 SQL 마이그레이션을 트랜잭션으로 순서대로 실행한다.

### `game_sessions`

| 컬럼 | 타입 | 규칙 |
| --- | --- | --- |
| `id` | TEXT | UUID primary key |
| `student_hash` | TEXT | 정규화한 학번의 HMAC-SHA-256 hex 값, index |
| `nickname` | TEXT | trim 후 1~12자 |
| `email_ciphertext` | TEXT | AES-256-GCM 암호문 Base64 |
| `email_iv` | TEXT | 12바이트 nonce Base64 |
| `email_auth_tag` | TEXT | GCM 인증 태그 Base64 |
| `phone_ciphertext` | TEXT | AES-256-GCM 암호문 Base64 |
| `phone_iv` | TEXT | 12바이트 nonce Base64 |
| `phone_auth_tag` | TEXT | GCM 인증 태그 Base64 |
| `privacy_consent_version` | TEXT | 수집·이용 동의문 버전 |
| `third_party_consent_version` | TEXT | 센드비 제공 동의문 버전 |
| `consented_at_ms` | INTEGER | 두 필수 동의를 받은 서버 시각 |
| `course_json` | TEXT | 고정 코스의 JSON 스냅샷 |
| `started_at_ms` | INTEGER | 서버 epoch milliseconds |
| `expires_at_ms` | INTEGER | 시작 후 10분 |
| `completed_at_ms` | INTEGER NULL | 완료 요청 수신 시각 |
| `created_ip_hash` | TEXT | 요청 제한 감사용 일일 salt 기반 IP 해시 |

학번은 공백을 제거한 뒤 숫자 8자리 또는 10자리인지 검증하고 원문을 저장하지 않는다. 이메일은 trim하고 소문자로 정규화한 뒤 최대 254자와 일반적인 `local@domain` 형식을 검증한다. 휴대전화번호는 하이픈과 공백을 제거하고 `010`으로 시작하는 숫자 11자리인지 검증한다. 이메일과 휴대전화번호 암호화에는 각각 구분된 필드명과 세션 ID를 authenticated additional data로 사용해 암호문 교체와 다른 세션으로의 이동을 막는다.

두 동의는 모두 필수다. 클라이언트는 동의 여부만 전송하고, 서버가 현재 동의문 버전과 서버 수신 시각을 기록한다. 동의하지 않은 요청에는 세션을 발급하지 않는다.

### `game_records`

| 컬럼 | 타입 | 규칙 |
| --- | --- | --- |
| `id` | TEXT | UUID primary key |
| `session_id` | TEXT | `game_sessions.id` unique foreign key |
| `student_hash` | TEXT | 최고 기록 조회용 복제 컬럼, index |
| `nickname` | TEXT | 완료 당시 별명 스냅샷 |
| `official_elapsed_ms` | INTEGER | 서버 측 완료 시간 |
| `reported_elapsed_ms` | INTEGER | 프론트가 보고한 감사용 시간 |
| `typo_count` | INTEGER | 0 이상의 정수 |
| `completed_at_ms` | INTEGER | 서버 완료 시각, index |

`session_id`의 unique 제약과 완료 트랜잭션으로 같은 세션의 중복 저장을 막는다. 전체 삭제 시 records를 먼저 지우고 sessions를 지우며 하나의 트랜잭션으로 처리한다.

### `schema_migrations`

적용된 마이그레이션 번호와 적용 시각을 저장한다. 애플리케이션 코드가 기대하는 버전보다 DB 버전이 높으면 서버 시작을 거부한다.

## 리더보드 규칙

학번별 최고 기록은 다음 순서로 한 건을 선택한다.

1. `official_elapsed_ms` 오름차순
2. `typo_count` 오름차순
3. `completed_at_ms` 오름차순
4. `id` 오름차순

선택된 학번별 최고 기록을 같은 기준으로 다시 정렬해 공개 순위를 부여한다. 공개 리더보드는 상위 10건을 반환한다. 관리자 CSV도 학번별 최고 기록만 같은 순서로 제공한다.

공식 시간이 5초 미만이거나 10분을 초과하면 완료 요청을 거부한다. `reported_elapsed_ms`는 0 이상 10분 이하인지 검증하지만 순위 계산에는 사용하지 않는다.

## API 계약

모든 JSON 응답은 기존 프론트 계약과 같은 형태를 유지한다.

```json
{
  "code": "SUCCESS",
  "message": "요청을 처리했습니다.",
  "data": {}
}
```

### 세션 생성

`POST /api/v2/campus-typing/sessions`

```json
{
  "studentNumber": "20240001",
  "nickname": "청룡",
  "email": "player@example.com",
  "phoneNumber": "01012345678",
  "privacyConsent": true,
  "thirdPartyConsent": true
}
```

입력과 두 필수 동의를 검증하고 개인정보를 변환한 뒤 세션을 생성한다. 응답에는 세션 ID, 고정 코스, 서버 시작 시각과 만료 시각만 포함한다. 학번, 이메일, 휴대전화번호와 동의 감사 정보는 반환하지 않는다.

세션 생성은 IP당 분당 10회, 학번 해시당 분당 3회로 제한한다.

### 세션 완료

`POST /api/v2/campus-typing/sessions/{sessionId}/completion`

```json
{
  "reportedElapsedMilliseconds": 28420,
  "typoCount": 3
}
```

세션 존재 여부, 만료, 중복 완료와 공식 시간 범위를 검사한 뒤 세션 완료 표시와 기록 삽입을 한 트랜잭션으로 처리한다. 응답은 기존 `CompletionResponse` 형태를 유지하고 독립 서버에 저장된 정상 기록이므로 `rankingStatus`는 항상 `ELIGIBLE`이다.

완료 요청은 IP당 분당 30회로 제한하며 세션별 완료는 DB unique 제약으로 한 번만 허용한다.

### 공개 리더보드

`GET /api/v2/campus-typing/leaderboard`

```json
{
  "code": "SUCCESS",
  "message": "요청을 처리했습니다.",
  "data": {
    "entries": [],
    "updatedAt": "2026-09-08T00:00:00.000Z"
  }
}
```

학번별 최고 기록 상위 10건을 반환한다. 이메일, 학번 해시와 세션 ID는 포함하지 않는다. IP당 분당 120회로 제한한다.

### 관리자 CSV

`GET /api/v2/admin/campus-typing/records.csv`

`Authorization: Bearer <ADMIN_TOKEN>`을 요구한다. 토큰은 timing-safe 비교를 사용한다. 응답은 UTF-8 BOM이 포함된 CSV이며 `Content-Disposition: attachment`를 지정한다.

CSV 컬럼은 `rank`, `studentHash`, `nickname`, `email`, `phoneNumber`, `officialElapsedMilliseconds`, `typoCount`, `completedAt`, `privacyConsentVersion`, `thirdPartyConsentVersion`, `consentedAt` 순서다. 쉼표, 따옴표와 줄바꿈을 CSV 규칙에 맞게 escape하고 `=`, `+`, `-`, `@`, 탭 또는 carriage return으로 시작하는 문자열에는 작은따옴표를 붙여 스프레드시트 수식 삽입을 막는다.

관리자 요청은 IP당 분당 10회로 제한한다. 인증 실패 응답은 토큰의 존재 여부나 값에 관한 세부 정보를 노출하지 않는다.

### 전체 데이터 삭제

`DELETE /api/v2/admin/campus-typing/records`

관리자 Bearer 토큰과 다음 JSON 본문을 모두 요구한다.

```json
{
  "confirmation": "DELETE ALL CAMPUS TYPING DATA"
}
```

확인 문자열이 정확히 일치할 때만 records와 sessions를 하나의 트랜잭션으로 삭제한다. 응답에는 삭제된 세션 수와 기록 수만 포함한다. 복호화된 이메일이나 학번 해시는 로그와 응답에 남기지 않는다.

## 오류 응답

| HTTP | code | 조건 |
| --- | --- | --- |
| 400 | `TYPING_INVALID_INPUT` | 학번, 별명, 이메일 또는 완료 본문 오류 |
| 401 | `TYPING_ADMIN_UNAUTHORIZED` | 관리자 인증 실패 |
| 404 | `TYPING_SESSION_NOT_FOUND` | 존재하지 않는 세션 |
| 409 | `TYPING_SESSION_COMPLETED` | 이미 완료된 세션 |
| 410 | `TYPING_SESSION_EXPIRED` | 만료된 세션 |
| 422 | `TYPING_INVALID_DURATION` | 공식 시간이 허용 범위 밖 |
| 429 | `TYPING_RATE_LIMITED` | 요청 제한 초과 |
| 500 | `INTERNAL_SERVER_ERROR` | 공개할 수 없는 서버 오류 |

Fastify의 validation 오류와 내부 예외를 이 형식으로 변환한다. 운영 로그에는 요청 ID, route, status, 처리 시간만 남기며 request body, authorization header, 학번, 이메일, 휴대전화번호와 암호문을 기록하지 않는다.

## 개인정보 동의문

개인정보처리자는 `ICT 위원회`로 표시한다. 동의문 버전은 최초 구현에서 `2026-09-08`을 사용하며 문구가 바뀌면 새 버전으로 올린다. 로비에서는 각 전문을 펼쳐 볼 수 있게 하고, 기본 선택되지 않은 별도 체크박스 두 개를 제공한다. 두 항목 모두 동의해야 게임 시작 버튼이 활성화된다.

### 개인정보 수집·이용 동의 (필수)

> ICT 위원회는 CAU Campus Typing Game 운영을 위해 아래와 같이 개인정보를 수집·이용합니다.
>
> - 수집·이용 목적: 게임 참여자 식별 및 중복 기록 관리, 리더보드 운영, 경품 추첨, 당첨 안내 및 경품 발송
> - 수집 항목: 학번, 별명, 이메일 주소, 휴대전화번호, 게임 기록(완료 시간 및 오타 수)
> - 보유·이용 기간: 경품 발송 완료 후 30일까지 보관한 뒤 지체 없이 파기
> - 공개 항목: 리더보드에는 별명, 완료 시간 및 오타 수만 공개되며 학번과 연락처는 공개되지 않습니다.
>
> 귀하는 개인정보 수집·이용 동의를 거부할 권리가 있습니다. 다만 필수 정보 수집에 동의하지 않으면 게임 참여와 경품 추첨 대상 등록이 제한됩니다.

체크박스 문구는 `개인정보 수집·이용에 동의합니다. (필수)`로 표시한다.

### 경품 발송을 위한 개인정보 제공 동의 (필수)

> ICT 위원회는 모바일 경품 발송을 위해 아래와 같이 개인정보를 제공합니다.
>
> - 제공받는 자: ㈜윈큐브마케팅(센드비)
> - 제공 목적: 당첨자 모바일 쿠폰 발송 및 발송 관련 고객지원
> - 제공 항목: 별명, 휴대전화번호
> - 제공받는 자의 보유·이용 기간: 경품 발송 및 관련 고객지원 목적 달성 후 지체 없이 파기. 단, 관계 법령에 따라 보존할 의무가 있는 경우 해당 법정 기간 동안 보관
>
> 귀하는 개인정보 제공 동의를 거부할 권리가 있습니다. 다만 필수 제공에 동의하지 않으면 게임 참여와 경품 추첨 대상 등록이 제한됩니다.

체크박스 문구는 `센드비를 통한 경품 발송을 위한 개인정보 제공에 동의합니다. (필수)`로 표시한다.

센드비 계약서에서 ㈜윈큐브마케팅이 개인정보 처리 수탁자로 규정되는 경우, 실제 운영 전 두 번째 문구를 처리위탁 고지로 교체하고 새 동의문 버전을 배포한다. 센드비는 모바일 쿠폰 발송 서비스의 운영 법인을 ㈜윈큐브마케팅으로 표시하고 있으며, 공식 서비스 안내에서 개인정보 파기 확인서 제공을 명시한다.

이 동의문은 구현을 위한 간단한 초안이며 법률 자문을 대체하지 않는다. 행사 공개 전 ICT 위원회의 공식 개인정보처리방침, 담당자 연락처, 센드비 계약서와 실제 경품 발송 절차를 기준으로 최종 검토한다.

동의문 초안은 개인정보 수집·이용 동의 시 목적, 항목, 보유 기간, 거부 권리와 불이익을 고지하도록 한 [개인정보 보호법 제15조](https://www.law.go.kr/LSW/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1029334809)와 개인정보 제공 동의 고지 사항을 정한 [개인정보 보호법 제17조](https://www.law.go.kr/LSW/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1006183947)를 기준으로 한다. 센드비의 법인명과 서비스 성격은 [센드비 공식 사이트](https://sendbee.co.kr/)와 [센드비 서비스 안내](https://sendbee.co.kr/solution/marketing)를 참고한다.

## 프론트 변경

- 로비 폼에 필수 이메일과 휴대전화번호 필드를 추가한다.
- 이메일은 trim 후 최대 254자와 기본 이메일 형식을 검사한다.
- 휴대전화번호는 입력 중 읽기 쉬운 `010-1234-5678` 형식으로 표시하고 API 요청에는 숫자 11자리로 정규화한다.
- 두 개인정보 동의 전문과 각각의 필수 체크박스를 추가한다. 체크박스는 기본값이 false이며 묶음 동의를 제공하지 않는다.
- `CreateSessionRequest`에 `email`, `phoneNumber`, `privacyConsent`, `thirdPartyConsent`를 추가하고 기존 API 경로는 유지한다.
- 테스트 모드에서도 같은 폼과 동의 검증을 사용하되 로컬 세션에는 이메일, 휴대전화번호와 동의 정보를 저장하지 않는다.
- 리더보드와 결과 화면은 기존 응답 형식을 그대로 사용한다.
- 고정 코스를 위해 로컬 세션의 shuffle을 제거하고 `CAMPUS_COURSE` 순서를 그대로 반환한다.

## 보안 및 운영 경계

- CORS는 `ALLOWED_ORIGINS`의 정확한 Origin만 허용한다.
- 프록시 신뢰는 `TRUST_PROXY`에 명시된 홉 수만 적용하며 기본값으로 전달 헤더를 신뢰하지 않는다.
- JSON body 크기는 16 KiB로 제한한다.
- 보안 헤더를 적용하되 TLS 종료 자체는 배포 계층의 책임이다.
- `SIGINT`와 `SIGTERM`에서 새 요청 수락을 중지하고 SQLite 연결을 닫는다.
- 암호화 키를 잃으면 이메일 복구가 불가능하므로 운영자가 DB와 키를 함께 안전하게 백업해야 한다.
- 키 교체 기능, 사용자 로그인, 관리자 웹 화면과 이메일 발송은 범위에 포함하지 않는다.

## 테스트 전략

### 순수 단위 테스트

- 학번 정규화와 HMAC이 원문을 노출하지 않는다.
- 이메일과 휴대전화번호의 AES-GCM 왕복, 잘못된 키·태그·세션 ID·필드 구분자에서 복호화가 실패한다.
- 학번별 최고 기록과 동률 정렬이 결정적이다.
- CSV escape와 수식 삽입 방지가 모든 위험 시작 문자를 처리한다.
- 관리자 토큰 비교와 확인 문자열 검증이 실패 시 삭제를 실행하지 않는다.

### 서버 통합 테스트

각 테스트는 임시 SQLite DB와 Fastify `inject`를 사용한다.

- 유효한 세션 생성부터 완료, 리더보드 반영까지 검증한다.
- 잘못된 학번·별명·이메일·휴대전화번호를 거부한다.
- 두 필수 동의 중 하나라도 false이거나 누락되면 세션을 생성하지 않는다.
- 서버가 현재 동의문 버전과 동의 시각을 저장한다.
- 만료, 중복 완료, 5초 미만 공식 기록을 거부한다.
- 같은 학번의 느린 기록은 보관하되 리더보드 최고 기록을 바꾸지 않는다.
- 같은 학번의 빠른 기록은 최고 기록과 순위를 갱신한다.
- 공개 응답에 학번, 해시, 이메일, 휴대전화번호, 동의 감사 정보와 암호문이 없다.
- 관리자 CSV는 인증을 요구하고 복호화된 이메일·휴대전화번호와 동의 감사 정보를 최고 기록에 맞게 제공한다.
- 잘못된 확인 문자열이나 토큰으로 전체 삭제할 수 없다.
- 정상 전체 삭제 뒤 세션, 기록과 CSV가 비어 있다.
- 요청 제한이 route별 경계를 적용한다.

### 프론트 회귀 테스트

- 이메일과 휴대전화번호 필드가 필수이며 유효하지 않으면 게임을 시작하지 않는다.
- 두 필수 동의를 개별적으로 선택하지 않으면 게임을 시작하지 않는다.
- 동의 전문을 키보드와 스크린 리더로 열고 읽을 수 있다.
- 세션 생성 요청에 정규화한 이메일·휴대전화번호와 두 동의 여부가 포함된다.
- API 오류 시 연락처를 포함한 입력값과 동의 상태를 유지하고 재시도할 수 있다.
- 기존 플레이, 결과와 리더보드 테스트가 새 서버 응답 계약에서도 통과한다.

루트 검증 명령은 프론트 단위 테스트, 서버 테스트, 양쪽 TypeScript 빌드와 기존 브라우저 테스트를 독립적으로 실행할 수 있게 구성한다.

## 완료 기준

- 새 환경에서 마이그레이션을 적용해 빈 SQLite DB로 서버를 시작할 수 있다.
- 프론트에서 이메일, 휴대전화번호와 두 필수 동의를 포함해 세션을 만들고 완주 기록을 저장할 수 있다.
- 같은 학번은 공개 리더보드에 최고 기록 한 건만 나타난다.
- 공개 API와 로그에서 이메일, 휴대전화번호 및 학번 관련 비공개 값이 확인되지 않는다.
- 관리자 토큰으로 연락처와 동의 감사 정보가 포함된 최고 기록 CSV를 받고 확인 문자열과 함께 전체 데이터를 삭제할 수 있다.
- 프론트와 서버의 전체 자동화 테스트 및 빌드가 통과한다.
