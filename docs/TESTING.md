# 테스트 — 목표 행동 개입 시스템 1차

새 테스트 의존성 없음. Node 18+ 내장 `node --test` + `node:assert/strict` + 내장 `fetch`만 사용.

```
npm test
```

## 자동 테스트

**`test/intervention-engine.test.js`** — 순수 엔진 함수 유닛테스트 (`public/intervention-engine.js`를
Node에서 직접 `require`):

- 18:59 KST → `shouldNotifyNow` false / 19:00 KST 정각 → true
- 같은 로컬 날짜 내에서 `now`가 달라도 `occurrenceKey` 동일
- 미루기 시 `nextInterventionAt = now + snoozeMinutes`
- `snoozeCount >= maxSnoozeCount` → `canSnooze` false
- UTC 자정을 넘어 KST 날짜가 바뀌는 경계(`2026-08-03T16:30:00Z` = KST `2026-08-04 01:30`) 처리
- 상태 전이표: 정상 전이 전부 true, `completed→started`/`skipped→completed`/`missed→snoozed` 등 전부 false
- `completed`/`skipped`/`missed`는 터미널(빈 전이 목록)
- `behavior` 미설정/비활성 목표는 `getTodayOccurrence`가 `null` 반환

**`test/goal-executions.route.test.js`** — `api/index.js`의 Express 앱을 `.listen(0)`으로 띄우고 내장
`fetch`로 통합 테스트 (추가 의존성 없음):

- `GET /today` 연속 호출 → 동일 레코드(재생성 없음)
- `Promise.all`로 동시 5회 `GET /today` → 최종 해당 occurrenceKey 레코드 1개만 존재
- 동일 `to`로 transition 반복 호출 → 두 번째는 에러 없이 성공, history 미추가
- 터미널 상태(`completed`)에서 다른 상태로 전이 시도 → `409 INVALID_STATUS_TRANSITION`
- 목표 `behavior.time` 변경 후에도 기존 실행 기록의 `scheduledFor`/`occurrenceKey` 불변, 새 `GET /today`는
  새 시간 기준으로 계산
- `behavior` 필드 없는 구버전 `goals.json`으로도 정상 응답(기본값 채움) + 파일 자체는 변형되지 않음

테스트는 시작 전 `data/goals.json`/`data/goal-executions.json`을 백업하고 종료 후 원상 복구한다(로컬
개발 중인 실제 데이터를 덮어쓰지 않기 위함).

## 수동 스모크 테스트 (curl)

```bash
npm start &
COOKIE=$(curl -s -c - -X POST http://localhost:3000/api/login \
  -H 'content-type: application/json' -d '{"password":"eunyu2026"}' \
  | grep session | awk '{print $6"="$7}')

# 목표 생성 + 스케줄 설정
GOAL_ID=$(curl -s -b "$COOKIE" -X PUT http://localhost:3000/api/goals \
  -H 'content-type: application/json' -d '{"title":"매일 운동"}' | node -pe "JSON.parse(require('fs').readFileSync(0)).id")
curl -s -b "$COOKIE" -X PATCH http://localhost:3000/api/goals \
  -H 'content-type: application/json' -d '{"behavior":{"enabled":true,"time":"19:00"}}'

# 오늘 실행 회차 조회/생성 (멱등)
curl -s -b "$COOKIE" "http://localhost:3000/api/goal-executions/today?goalId=$GOAL_ID"

# 개발용 테스트 트리거 (즉시 notified로)
curl -s -b "$COOKIE" -X POST http://localhost:3000/api/goal-executions/test-trigger \
  -H 'content-type: application/json' -d "{\"goalId\":\"$GOAL_ID\"}"

# 존재하지 않는 목표 → 404 GOAL_NOT_FOUND
curl -s -b "$COOKIE" "http://localhost:3000/api/goal-executions/today?goalId=nope"

# 인증 없이 → 기존 포맷 401
curl -s "http://localhost:3000/api/goal-executions/today?goalId=$GOAL_ID"

# 기존 라우터 응답 포맷 무변화 확인
curl -s -b "$COOKIE" "http://localhost:3000/api/settings"
```

확인 포인트:
- `today`를 두 번 호출해도 `id`가 같음(재생성 없음)
- `test-trigger` 응답의 `status`가 `notified`로 바뀜 (이미 `notified`거나 그 이후 상태면 그대로 유지)
- 로그인 없이 신규 엔드포인트를 호출해도 다른 라우트와 동일하게 `{"error":"unauthorized"}`
- 기존 페이지(`/`, `/calendar.html`, `/diary.html`, `/history.html`, `/wrongnotes.html`)와 기존 API가
  이전과 동일하게 동작
