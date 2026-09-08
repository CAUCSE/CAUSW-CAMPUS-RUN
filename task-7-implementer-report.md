# Task 7 구현 보고

## 구현 범위

- 관리자 Bearer 토큰을 SHA-256 digest 뒤 `timingSafeEqual`로 검증했다.
- 인증 후에만 최고 기록의 연락처를 복호화해 UTF-8 BOM/CRLF CSV로 제공한다.
- CSV 수식 주입 문자와 쉼표·따옴표·개행을 안전하게 이스케이프한다.
- 관리자 전용 IP당 분당 10회 제한과 비캐시 CSV 헤더를 추가했다.
- 정확한 `DELETE ALL CAMPUS TYPING DATA` 확인 문자열이 있을 때만 기존 저장소의 즉시 트랜잭션 삭제를 호출한다.

## TDD 및 검증

- Red: `npm --prefix server test -- --run test/admin-api.test.ts`는 `../src/csv.js`가 없어 실패하는 것을 확인했다.
- Green: 같은 관리자 API 테스트 8개가 모두 통과했다.
- 전체 검증: `npm run verify` 통과
  - 프론트 테스트: 10 files, 40 tests
  - 서버 테스트: 8 files, 60 tests
  - 프론트/서버 TypeScript 및 Vite 빌드 통과

## 보안 확인

- 누락·형식 오류·불일치 토큰의 CSV 요청은 복호화 실패를 유발하도록 손상된 암호문이 있어도 401을 반환하도록 테스트했다.
- 권한 없는 삭제 요청은 정확한 확인 문자열을 포함해도 401이며 레코드를 보존하도록 테스트했다.
- CSV는 인증 성공 응답 외에 복호화 연락처, 학번 해시 또는 암호화 메타데이터를 노출하지 않는다.
