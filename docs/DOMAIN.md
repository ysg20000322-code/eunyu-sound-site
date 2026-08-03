# 목표 행동 개입(Intervention) 도메인 — 1차(도메인+백엔드)

## Goal vs GoalExecution

- **Goal** (`data/goals.json`) — 현재 단 하나만 존재하는 "목표" 자체. `behavior` 필드로 "매일 몇 시에
  리마인드할지"를 설정한다. 여러 날에 걸쳐 반복되는 스케줄 *정의*다.
- **GoalExecution** (`data/goal-executions.json`, 배열) — 특정 날짜·시각에 대한 **1회성 실행 기록**.
  Goal.behavior가 "매일 19시"를 정의한다면, GoalExecution은 "2026-08-03 19시 그 한 번"에 실제로 무슨 일이
  있었는지(시작했는지, 미뤘는지, 건너뛰었는지, 완료했는지)를 기록한다.

이 둘을 분리한 이유는 `docs/DECISIONS.md` 참고.

## occurrenceKey 생성 규칙

```
occurrenceKey = `${goalId}:${localDate}:${time}`
예: "98df9986-...:2026-08-03:19:00"
```

- `localDate`: `goal.behavior.timezone` 기준 "YYYY-MM-DD" (UTC 날짜가 아님)
- `time`: `goal.behavior.time` 그대로 "HH:mm"
- 계산은 `public/intervention-engine.js`의 `getTodayOccurrence(goal, now)`가 담당하며, `goalId + localDate +
  time`을 조합하므로 동일한 목표·같은 날·같은 스케줄 시각에 대해서는 항상 같은 키가 나온다(멱등성의 기반).
- 목표의 `behavior.time`을 바꾸면 **그 순간부터** 새 시각 기준으로 키가 계산된다. 이미 만들어진 과거
  GoalExecution의 `occurrenceKey`/`scheduledFor`/`timezone`은 생성 시점에 스냅샷되어 절대 바뀌지 않는다
  (goal을 다시 읽어 재계산하지 않음).

## 상태 전이표

```
scheduled -> notified, started, skipped
notified  -> snoozed, started, skipped, missed
snoozed   -> notified, started, skipped, missed
started   -> completed, skipped
completed -> (없음, 터미널)
skipped   -> (없음, 터미널)
missed    -> (없음, 터미널)
```

- 정의: `public/intervention-engine.js`의 `TRANSITIONS`/`isValidTransition(from, to)`.
- 검증 위치: **서버가 유일한 권위**. `routes/goalExecutions.js`의 `PATCH /:id/transition`이 클라이언트가
  보낸 `to`를 항상 `isValidTransition`으로 재검증한다(2차 프론트가 같은 함수로 버튼 비활성화 등 UX용
  사전 검증을 해도, 서버 검증을 대체하지 않음).
- 동일한 `to`를 반복 요청하면(현재 status와 같음) **에러 없이 그대로 성공 반환**(멱등 no-op). 중복 완료
  요청, 더블탭 등에 안전하다.
- `snoozed`로의 전이는 `snoozeCount >= maxSnoozeCount`면 상태표와 별개로 `409 SNOOZE_LIMIT_REACHED`.

## 시간대 처리

- `Goal.behavior.timezone`(IANA, 기본 `Asia/Seoul`)을 기준으로 "오늘"과 "예정 시각"을 계산한다.
- 새 라이브러리(luxon, date-fns-tz 등) 없이 표준 `Intl.DateTimeFormat`만으로 타임존 벽시계 시각 ↔ UTC
  변환을 구현(`zonedTimeToUtc`, `getZonedDateParts`, `getLocalDateString` — 전부
  `public/intervention-engine.js`).
- UTC 자정과 KST 자정이 다른 경우(예: UTC `2026-08-03T16:30:00Z` = KST `2026-08-04 01:30`)에도 `localDate`는
  타임존 기준으로 정확히 계산됨 — `test/intervention-engine.test.js`에서 검증.

## 오늘 실행 회차 생성·조회 흐름

1. 클라이언트: `GET /api/goal-executions/today?goalId=<id>`
2. 서버: goal 조회(없으면 404) → `behavior.enabled`/`time` 없으면 `{ok:true,data:null}`(오늘 예정 없음)
3. `getTodayOccurrence(goal, new Date())`로 오늘의 occurrenceKey 계산(서버 시각만 사용, 클라이언트가
   `now`를 조작할 수 없음)
4. `data/goal-executions.json`에서 `goalId+occurrenceKey` 일치 레코드 검색
   - 있으면 그대로 반환 (재생성 없음 — 새로고침, 여러 탭, 요청 재전송 전부 이 경로로 흡수됨)
   - 없으면 `status:"scheduled"`로 생성 → 저장 → **재조회해 같은 키가 여러 개면 가장 이른 `createdAt`만
     남기고 나머지 삭제**(파일 기반 저장소라 진짜 락은 없으므로 이 재조회 정리로 경합을 최소화 — 완전한
     원자성 보장은 아님, `docs/DECISIONS.md`에 한계 명시)

## 미루기(snooze) → 새로고침 복구 흐름

1. `notified` 상태에서 `PATCH /:id/transition {to:"snoozed"}` → `snoozeCount` 증가,
   `nextInterventionAt = now + behavior.snoozeMinutes`
2. 새로고침/재방문 시 클라이언트가 다시 `GET /today`를 호출하면 **같은 occurrenceKey**로 항상 같은
   레코드를 돌려받으므로 `status:"snoozed"`, `nextInterventionAt`이 그대로 복구됨
3. 1차(백엔드)에는 백그라운드 스케줄러가 없으므로, `snoozed` 상태가 `notified`로 자동 복귀하는 건 앱이
   열려서 `nextInterventionAt`을 확인하는 순간뿐이다. 이 상태 판단/전이 호출은 2차(프론트)의 몫이며,
   여기서는 그 판단에 필요한 데이터(상태, `nextInterventionAt`)만 정확히 유지한다.
4. `snoozeCount >= maxSnoozeCount`가 되면 이후 `snoozed` 요청은 `409 SNOOZE_LIMIT_REACHED` — 2차 UI가
   미루기 버튼을 숨기는 근거로 `canSnooze(execution)`을 그대로 재사용.

## 기존 목표 데이터 하위 호환

`goals.json`에 `behavior` 필드가 없어도(과거 데이터) 문제 없다. `lib/goalSchema.js`의 `normalizeGoal()`이
**읽을 때마다** 기본값(`{enabled:false, time:null, timezone:"Asia/Seoul", snoozeMinutes:5,
maxSnoozeCount:3}`)을 채워 반환한다. 파일은 절대 자동으로 다시 쓰지 않는다 — 마이그레이션/백업 정책은
`docs/DECISIONS.md` 참고.
