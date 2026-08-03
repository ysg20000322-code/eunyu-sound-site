# 설계 결정 기록 — 목표 행동 개입 시스템 1차

## activities/checklist를 실행 이력 저장소로 쓰지 않은 이유

기존 `activities`(자유 활동 로그)와 `checklist`(날짜별 체크리스트)는 모두 "사용자가 손으로 추가한 항목"
구조라, "정해진 스케줄의 N번째 회차가 지금 어떤 상태인가"(scheduled/notified/snoozed/...)라는 상태
머신을 표현하지 못한다. 억지로 끼워넣으면 status 전이 검증, occurrenceKey 멱등성, snoozeCount 등을
비정형 텍스트 필드에 숨겨야 해서 오히려 더 복잡해진다. 그래서 `GoalExecution`이라는 새 개념을 분리했다.

## Web Push / Vercel Cron / Capacitor를 1차에서 제외한 이유

- 실제 정시 발송을 하려면 `web-push` 새 의존성, VAPID 키 발급·환경변수 설정, Vercel Cron 설정(무료 플랜
  1일 1회 제한 확인 필요), 브라우저 알림 권한 UX 등 인프라 승인이 필요한 항목이 여러 개 겹친다.
- 사용자가 이번 단계는 "도메인 모델 + 앱 내부 테스트 UI로 검증 가능한 데까지"로 명시적으로 범위를
  잘랐고, 실제 정시 알림은 이후 Capacitor(네이티브 로컬 알림) 단계로 미루기로 확정했다.
- 그래서 **행동 판단 로직**(`public/intervention-engine.js`)과 **전달 방식**(인앱 모달 → 이후 웹푸시 →
  이후 Capacitor 로컬 알림)을 처음부터 분리해서 설계했다. 엔진은 순수 함수라 전달 방식이 바뀌어도 그대로
  재사용된다.

## API 응답 포맷을 새 엔드포인트에만 적용한 이유

기존 8개 라우터(`goals`, `settings`, `events`, `activities`, `checklist`, `diary`, `wrongnotes`,
`checkins`)는 프런트가 이미 raw JSON 응답을 그대로 파싱하고 있어서, 응답 포맷을 바꾸면 프런트 코드 전체를
동시에 고쳐야 하는 큰 리팩터링이 된다. 이번 기능과 무관한 위험을 늘리고 싶지 않아서, `{ok,data}`/
`{ok,error}` 포맷은 **새로 만드는 `goal-executions` 라우터에만** 적용했다. 기존 라우터 전체를 새 포맷으로
통일하는 작업은 별도 리팩터링 과제로 남긴다.

한 가지 불가피한 비일관성: 인증 게이트(`api/index.js`의 전역 미들웨어)에서 막히는 `401`은 모든 라우트
공통으로 여전히 옛 포맷(`{error:"unauthorized"}`)이다. 이건 게이트가 라우터보다 앞단에 있어서 새
라우터만 다른 401 포맷을 쓰게 만들 수 없기 때문— 그대로 두었다.

## 백업/마이그레이션을 만들지 않은 이유

이번 구현은 `Goal.behavior` 필드를 **읽을 때만 기본값으로 채워서** 반환한다(`lib/goalSchema.js`의
`normalizeGoal`). 기존 `goals.json` 파일 자체는 절대 다시 쓰지 않는다 — 사용자가 실제로 목표를
수정(PATCH)해야만 그 목표 객체에 `behavior`가 영구히 붙는다. 즉 **기존 데이터를 직접 변환하는 파괴적
마이그레이션이 없으므로**, 사용자가 확정한 규칙("실제 스키마 마이그레이션 직전에만 백업 1회")에 따라
이번 단계는 백업 파일도, `schemaVersion`/마이그레이션 완료 마커도 만들지 않았다.

향후 정말로 기존 파일을 직접 변환해야 하는 마이그레이션이 생기면: 변환 직전 `data/backups/<name>.<버전>.json`
1회 생성 + `schemaVersion` 필드로 반복 실행 방지(이미 해당 버전 백업이 있으면 스킵)를 쓰기로 한다.

## 파일 기반 저장소의 동시쓰기 한계

`lib/store.js`는 파일(또는 Vercel Blob) 직접 read-modify-write이고 락이 없다. `GET /today`를 여러 탭에서
동시에 호출하면 이론적으로 중복 레코드가 생길 수 있다. 이를 "쓰기 후 재조회 정리"(같은 occurrenceKey가
여러 개면 가장 이른 것만 남기고 정리)로 완화했지만, 진짜 동시 요청 하에서 100% 원자성을 보장하지는
않는다. 개인 단일 사용자 앱 규모에서는 실질적 위험이 낮다고 판단해 별도 DB/락 도입 없이 이 수준에서
마무리했다 — `test/goal-executions.route.test.js`의 동시 요청 테스트로 실제로는 잘 흡수됨을 확인했다.

## 3차(Capacitor Android): 웹 자산 번들 대신 원격 URL을 선택한 이유

두 방식을 비교했다: (A) 웹 자산을 앱에 번들하고 원격 API만 호출 vs (B) 배포된 사이트를 `capacitor.config`의
`server.url`로 직접 표시.

A를 선택하면 WebView 출처(`capacitor://localhost`)와 API 출처(Vercel)가 달라져 **크로스 오리진**이 된다.
지금의 `session` 쿠키(`HttpOnly; SameSite=Lax`, `lib/auth.js`)를 그대로 쓰려면 `SameSite=None; Secure`로
완화하고 `api/index.js`에 CORS 미들웨어를 추가해야 하는데, 이는 CSRF 방어를 약화시키고 인증 아키텍처
전체에 손을 대는 일이라 이번 범위("행동 판단 로직과 전달 방식만 분리, 기존 걸 최대한 안 건드림")에 안
맞는다. 게다가 모든 `fetch("/api/...")` 상대경로 호출(홈/캘린더/일기/활동/오답노트 전부)을
`API_BASE_URL` 절대경로로 바꿔야 해서 변경 범위가 커진다.

B(선택)는 WebView가 실제 배포 도메인을 그대로 로드하므로 **동일 출처**가 유지된다 — 쿠키 인증도, 상대경로
fetch도, 응답 포맷도 전부 무변경. 대신 "오프라인에서도 동작해야 하는 핵심"(리마인더 자체)은 웹뷰가 떠
있는지와 무관하게 **순수 네이티브**(`@capacitor/local-notifications`)로 처리해서, B의 약점(오프라인 UI
불가)이 실제 요구사항과 충돌하지 않게 설계했다. `webDir`는 Capacitor 설정상 필수라 기존 `public/`을 그대로
가리키게 했다 — `server.url`이 있으면 실제로 로드되지 않는 껍데기라 별도 빌드/복사 스크립트가 필요 없다.

## 알림 ID에 occurrenceKey를 쓰지 않은 이유

처음엔 "알림 ID ↔ occurrenceKey"를 1:1로 매핑하려 했지만, Android의 `on:{hour,minute}` 스케줄은 **매일
자동으로 반복**되므로(cron과 비슷하게 동작) 앱이 매일 재예약할 필요가 없다는 걸 고려하면 occurrenceKey를
예약 시점에 미리 알림에 박아둘 이유가 없어진다. 대신 알림에는 `{goalId}`만 담고, 알림이 울리거나 액션을
누른 시점에 항상 서버 `GET /today`로 그날의 occurrenceKey/실행 기록을 새로 조회한다. 알림 ID는
`hash(goalId + ":daily")`(매일 반복 1개), 미루기 후 알림은 `hash(goalId + ":snooze")`(스누즈마다 덮어씀) —
둘 다 문자열→32비트 정수 결정적 해시라 별도 매핑 테이블이 필요 없다. occurrenceKey 생성·상태 전이 규칙은
여전히 서버(`routes/goalExecutions.js`)와 엔진(`public/intervention-engine.js`)에만 있고, 네이티브 코드는
전혀 복제하지 않는다.

## 반복 알림의 타임존 한계 (알려진 한계)

Android의 `on:{hour,minute}` 반복 알림은 **기기의 현재 로컬 타임존** 기준으로 매일 그 시각에 울린다.
`goal.behavior.timezone`이 기기 타임존과 다르면(예: 목표는 Asia/Seoul 기준인데 폰이 실제로 해외에 있는
경우) 실제 알림 시각이 어긋날 수 있다. `scheduledFor` 자체는 이미 UTC 절대 시각으로 정확히 계산되지만,
그 값을 네이티브 반복 알림에 그대로 매핑하는 대신 매번 절대 시각 1회성 알람으로 재예약하려면 앱을 자주
열어야 한다는 트레이드오프가 있어(자세한 대안은 아래 문단), 이번 단계는 "기기 타임존 = 목표 타임존"이
거의 항상 맞는 개인용 단일 사용자 앱 특성상 반복 알림 방식을 택했다. 목표 시각/타임존 자체를 앱에서
바꾸면(`lifeapp:goal-updated` 이벤트) 기존 알림을 취소하고 새 값으로 재예약하므로 그 경우는 문제없다.

## 앱이 종료된 상태에서의 알림 액션 처리 한계

알림의 "시작/미루기/건너뛰기" 버튼을 누르면 Capacitor의 `localNotificationActionPerformed` 리스너가
JS 컨텍스트에서 실행된다. 앱이 완전히 종료된 상태였다면 OS가 앱을 (백그라운드로) 콜드 스타트시켜 이
리스너가 실행되게 한다 — 완전히 무음으로, 앱 프로세스 자체를 띄우지 않고 처리하는 방식(커스텀 네이티브
`BroadcastReceiver` 작성)은 이번 범위 밖으로 뒀다. 콜드 스타트 시 리스너를 놓치지 않도록
`public/capacitor-notification-adapter.js`는 `DOMContentLoaded`를 기다리지 않고 스크립트 로드 시점에
바로 리스너를 등록하고, `index.html`에서도 가장 먼저 로드되는 스크립트로 배치했다.

## 알림 권한 거부 시 폴백

`POST_NOTIFICATIONS`(Android 13+) 권한이 없으면 `LocalNotifications.schedule()` 호출 자체는 성공해도
알림이 표시되지 않는다. 이 상태에서도 **기존 인앱 폴링 기반 개입 UI(`intervention-ui.js`)는 그대로
동작**한다 — 앱을 열어두면 지금까지와 똑같이 동작하고, 네이티브 알림만 못 받을 뿐이라 완전히 막히지
않는다. 어댑터는 권한이 없거나 정확한 알람 권한이 꺼져 있으면 홈 화면에 배너를 띄워 재요청/설정 이동
버튼을 보여준다(`public/capacitor-notification-adapter.js`가 자체적으로 DOM에 주입 — `index.html`/
`style.css` 변경 없이 자기완결적으로 동작).
