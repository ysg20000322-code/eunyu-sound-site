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

## 3차(Capacitor Android): 자동 테스트 vs 수동 테스트

**`test/capacitor-notification-adapter.test.js`** — Node에서 테스트 가능한 **순수 부분만**
(`Capacitor.Plugins.LocalNotifications` 네이티브 호출부는 브라우저 브릿지가 없는 Node에서 애초에 불가능):

- 해시 함수(`hashToId`)의 결정성 — 같은 문자열은 항상 같은 32비트 정수
- `dailyNotificationId`/`snoozeNotificationId`가 같은 goalId에 대해 서로 다른 값
- `planActionSequence(currentStatus, action)` — `scheduled`에서는 항상 `notified`를 먼저 거침, 이미
  `notified`/`snoozed`면 요청 액션으로 바로, 현재 상태와 요청 액션이 같으면 빈 배열(무동작)
- Node/비브라우저 환경에서 `require`하면 순수 함수만 노출되고 `reconcile`/`isAvailable` 등 네이티브
  호출 함수는 없음(안전하게 no-op)

**Android Studio에서만 확인 가능한 수동 테스트** (실제 기기/에뮬레이터, `docs/ANDROID_SETUP.md` 참고):

- 로그인 → 홈 진입(기존 웹과 동일 동작 회귀 확인)
- 목표+리마인더 시각(몇 분 뒤)으로 저장 → 알림 권한 요청 다이얼로그 → 허용 → 설정 시각에 실제 알림 도착
- 알림 "시작" 액션 탭(앱 백그라운드 상태/완전 종료 상태 각각) → 서버 상태가 `started`로 반영되는지,
  앱을 열면 홈 화면에 반영되는지
- "5분 미루기" 탭 → 5분 뒤 두 번째(스누즈) 알림이 실제로 도착하는지
- "오늘 건너뛰기" 탭 → `skipped` 반영, 같은 날 재알림 없음
- 목표 시각 변경 저장 → 기존 예약 취소 + 새 시각 재예약(다음날 알림으로 간접 확인)
- 리마인더 토글 끄기 / 목표 삭제 / 목표 완료 처리 → 관련 알림이 실제로 취소되는지
- 알림 권한을 거부한 상태의 UX(홈 화면 배너), 정확한 알람 권한이 꺼진 상태의 동작(대체 스케줄 + 배너)
- 며칠 앱을 열지 않다가 재실행했을 때 재조정(reconcile)이 정상 동작하는지
- 개발용 "지금 테스트" 버튼이 네이티브 앱 안에서도 동작하는지, 프로덕션 빌드에서는 숨겨지는지
- 기존 캘린더/일기/활동/오답노트/로그인·로그아웃 등 웹 기능 전체가 앱 안에서도 정상 동작하는지 회귀 확인
