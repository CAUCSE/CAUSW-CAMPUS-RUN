# CAU Campus Typing API Contract

## Scope

CAUSW 백엔드가 축제 부스 게임의 세션, 기록, 공개 리더보드, 관리자 기록 관리를 담당한다. 모든 응답은 기존 `ApiResponse<T>`의 `code`, `message`, `data` 형식을 사용한다. 공개 API는 `/api/v2/campus-typing`, 관리 API는 `/api/v2/admin/campus-typing` 아래에 둔다.

## Course

각 세션은 아래 18개 장소를 모두 사용하고, 순서만 무작위로 섞는다. 약 93글자로 평균 25~35초 완주를 목표로 한다.

영신관, 파이퍼홀, 수림과학관, 학생회관, 본관, 전산정보관, 서라벌홀, 중앙도서관, 봅스트홀, 제2공학관, 창업보육관, 중앙문화예술관, 대학원, 법학관, 미디어공연영상관, 글로벌하우스, 블루미르홀, 100주년기념관

## Record eligibility

| Status | Meaning | Public leaderboard |
| --- | --- | --- |
| `ELIGIBLE` | 활성 CAUSW 사용자와 학번이 연결된 기록 | Included |
| `PENDING_REGISTRATION` | 가입·활성화 전 학번으로 제출된 기록 | Excluded |
| `REJECTED` | 운영자가 테스트 또는 부정 기록으로 제외 | Excluded |

가입 여부와 관계없이 모든 완주 기록은 저장한다. 학번 원문은 로그·공개 응답·프론트 저장소에 남기지 않는다. 서버는 숫자만 남긴 학번의 HMAC-SHA-256 식별값을 저장한다. 축제 당일 자정 전 CAUSW 가입·활성화가 완료되면 해당 식별값의 당일 최고 기록을 `ELIGIBLE`로 승격한다. 가입 완료 도메인 이벤트로 즉시 재평가하고, 종료 전 배치 재평가를 한 번 수행한다.

## Public API

### Create session

`POST /api/v2/campus-typing/sessions`

인증은 요구하지 않는다. `studentNumber`는 숫자 8자리 또는 10자리, `nickname`은 trim한 1~12자로 검증한다. 존재하지 않는 학번도 세션 생성을 허용한다.

```json
// request data
{ "studentNumber": "20240001", "nickname": "청룡" }

// response data
{
  "sessionId": "0b2b8801-4f84-4e9e-85da-20c1fb7d1c06",
  "course": ["본관", "중앙도서관"],
  "startedAt": "2026-09-02T14:00:00+09:00",
  "expiresAt": "2026-09-02T14:10:00+09:00"
}
```

`course`에는 18개 장소가 모두 포함된다. 세션은 10분 후 만료되고 한 번만 완료할 수 있다.

### Complete session

`POST /api/v2/campus-typing/sessions/{sessionId}/completion`

```json
// request data
{ "reportedElapsedMilliseconds": 28420, "typoCount": 3 }

// response data
{
  "recordId": "58f3b2ce-9d54-4c80-9e69-277c4b967e77",
  "nickname": "청룡",
  "officialElapsedMilliseconds": 28501,
  "typoCount": 3,
  "rankingStatus": "ELIGIBLE",
  "rank": 4,
  "leaderboard": [{
    "rank": 1,
    "nickname": "코딩왕",
    "officialElapsedMilliseconds": 24120,
    "typoCount": 1
  }]
}
```

순위에는 세션 생성 시각부터 서버가 완료 요청을 받은 시각까지 계산한 `officialElapsedMilliseconds`를 쓴다. `reportedElapsedMilliseconds`는 화면 표시 오차 감사용이다. `PENDING_REGISTRATION`이면 `rank`는 `null`이고 프론트는 가입 후 당일 반영 안내를 표시한다.

### Public leaderboard

`GET /api/v2/campus-typing/leaderboard?limit=10`

`limit`은 1~50, 기본값은 10이다. 운영일의 `ELIGIBLE` 기록을 학번별 최고 기록으로 중복 제거한 뒤 공식 시간, 오타 수, 완료 시각 순으로 정렬한다.

```json
{
  "entries": [{
    "rank": 1,
    "nickname": "코딩왕",
    "officialElapsedMilliseconds": 24120,
    "typoCount": 1
  }],
  "updatedAt": "2026-09-02T14:01:30+09:00"
}
```

## Admin API

- `GET /api/v2/admin/campus-typing/records?status=ELIGIBLE&page=0&size=20`: 기존 `PageResponse`로 기록을 조회한다. 목록에는 별명, 공식 시간, 오타 수, 상태, 완료 시각, 내부 사용자 연결 여부만 제공한다.
- `POST /api/v2/admin/campus-typing/records/{recordId}/reject`: `{ "reason": "운영 테스트 기록" }`을 받아 상태를 `REJECTED`로 바꾸고 공개 최고 기록을 재계산한다. 삭제하지 않아 감사 이력을 남긴다.

두 API 모두 `ADMIN` 또는 `SYSTEM_ADMIN` 권한을 요구한다.

## Error and protection

| HTTP | Code | Meaning |
| --- | --- | --- |
| 400 | `TYPING_400_001` | 학번 형식 오류 |
| 400 | `TYPING_400_002` | 별명 형식 오류 |
| 404 | `TYPING_404_001` | 존재하지 않는 세션 |
| 409 | `TYPING_409_001` | 이미 완료된 세션 |
| 410 | `TYPING_410_001` | 만료된 세션 |
| 429 | `TYPING_429_001` | 요청 제한 초과 |

공개 세션 API는 Spring Security에서 명시적으로 `permitAll` 처리하고, 배포 프론트엔드 Origin을 CORS 허용 목록에 추가한다. CORS는 인증 수단이 아니므로 학번 HMAC 기준 세션 생성은 1분 3회, 완료는 세션당 1회로 제한한다. 15초 미만 공식 기록은 저장하되 관리자 검토 대상으로 표시한다.

## Frontend contract

프론트엔드는 `sessionId`, 별명, 코스, 시작 시각, 만료 시각, 오타 수만 `sessionStorage`에 보관한다. 학번은 세션 생성 요청 뒤 보관하지 않는다. 결과·리더보드에는 서버가 반환한 `officialElapsedMilliseconds`만 사용한다.
