# Android 아키텍처 — 임시 결정과 알림 전달 구조

이 문서는 Android 셸의 두 가지 핵심 설계(원격 URL 로딩, 알림 전달)를 기록한다. 둘 다 "내부 프로토타입"
단계에 맞춘 최소 구현이고, Play Store 출시를 준비하는 시점엔 재검토가 필요하다.

## `server.url` 정책: 임시 결정

> **현재 `server.url` 방식은 Android 핵심 UX의 실기기 검증을 위한 임시 결정이며,
> 운영 및 스토어 배포 구조로 간주하지 않는다.**

- 현재 방식(웹 자산을 번들하지 않고 `capacitor.config.ts`의 `server.url`로 배포된 Vercel 사이트를 WebView가
  직접 로드)은 **기존 쿠키 인증(`lib/auth.js`)과 상대경로 `fetch("/api/...")` 호출을 그대로 재사용하기
  위한 임시 프로토타입 구조**다. 비교 근거는 `docs/DECISIONS.md` "3차" 항목 참고.
- **네트워크 또는 Vercel 장애 시 앱 화면 자체가 열리지 않을 수 있다** — WebView가 원격 URL을 그대로
  로드하는 구조라 로컬 폴백 화면이 없다.
- **오프라인 사용이 불가능하다** — 로그인 화면부터 원격 로딩이 필요하다. (단, 로컬 알림의 예약·발사·
  액션 수신·오프라인 액션 큐잉은 네이티브/로컬 저장소로 처리되므로 이 한계와 무관하게 동작한다 — 아래
  참고.)
- **Play Store 출시 전에는 웹 자산 번들 방식과 네이티브 앱 인증 구조를 재검토해야 한다** — 스토어
  배포판은 오프라인 셸이 필요할 가능성이 높고, 그러면 크로스 오리진 인증(CORS + `SameSite=None; Secure`
  쿠키 또는 토큰 기반 인증)을 다시 설계해야 한다.
- **`server.url` 제거 및 로컬 웹 자산 번들 전환은 별도 출시 준비 단계로 남긴다.** 이번 작업에서는 실제
  전환을 하지 않는다.

## 알림 ID와 `extra` 페이로드

`public/capacitor-notification-adapter.js`가 스케줄하는 알림은 두 종류, ID가 분리되어 있어 서로의 취소·
재예약에 영향을 주지 않는다:

```
dailyNotificationId = hashToId(`${goalId}:daily`)    // 매일 반복(schedule.on:{hour,minute})
snoozeNotificationId = hashToId(`${goalId}:snooze`)  // 1회성(schedule.at:<시각>), 스누즈마다 덮어씀
```

`hashToId`는 FNV-1a 32비트 해시를 양수 31비트로 마스킹한 결정적 함수(`test/capacitor-notification-adapter.test.js`
에서 검증). 같은 목표에 대해 두 ID가 다른 문자열(`:daily` vs `:snooze`)을 해싱하므로 충돌 가능성은
무시할 수 있는 수준이다.

각 알림의 `extra`:

```js
// 매일 반복 알림
{ kind: "daily-reminder", goalId, scheduleVersion, nominalTime, timezone }

// 스누즈 알림 (그날의 occurrenceKey를 정확히 유지)
{ kind: "snooze", goalId, occurrenceKey, scheduleVersion }
```

반복 알림에는 날짜별 `occurrenceKey`를 미리 넣지 않는다 — 알림이 울리거나 액션을 받은 시점에 항상
`GET /api/goal-executions/today`로 그날의 occurrenceKey/실행 기록을 새로 조회하기 때문이다(자세한 이유는
`docs/DECISIONS.md`). 스누즈 알림은 예약 시점에 이미 오늘의 실행 기록을 알고 있으므로 그 occurrenceKey를
그대로 담는다.

## `scheduleVersion`: 오래된 알림 방어

`Goal.behavior.scheduleVersion`(기본값 1, `lib/goalSchema.js`)은 **`behavior.time` 또는
`behavior.timezone`이 실제로 바뀔 때만** `routes/goals.js`의 PATCH 핸들러가 1 증가시킨다. 제목/메모/
마일스톤/스누즈분/최대 미루기 횟수 변경은 버전을 올리지 않는다 — 그런 변경은 "언제 알림이 오는지"에
영향을 주지 않으므로 오래된 알림 판단과 무관하다.

모든 알림은 예약 시점의 `scheduleVersion`을 `extra`에 싣고, 액션을 받으면 어댑터가 `GET /api/goals`로
받은 **현재** `scheduleVersion`과 비교한다(`isStaleAction`, 순수 함수, 테스트로 검증). 다르면:

- 그 알림은 오래된 일정의 것으로 간주하고 **GoalExecution을 건드리지 않는다**
- 배너로 "이전 일정의 알림이었어요. 최신 일정으로 갱신할게요" 안내
- `reconcile()`을 다시 실행해 최신 일정으로 알림을 재정렬

`scheduleVersion`이 없는(마이그레이션 이전) 알림이나 goal은 **fail-open**으로 처리한다 — 즉 "오래된
것"으로 판단하지 않고 정상 처리한다. 하위 호환을 위한 선택이다.

이 검증은 **클라이언트(어댑터)에서만** 이뤄지고 서버 `PATCH /:id/transition`은 여전히 `scheduleVersion`을
모른다 — 상태 전이 검증(`isValidTransition`)이라는 기존 서버 권위 구조를 건드리지 않기 위한 의도적
선택이다. 악의적 클라이언트를 방어하는 용도가 아니라 "실수로 오래된 알림을 눌렀을 때"를 다루는 것이
목적이라, 개인용 단일 사용자 앱 범위에서는 클라이언트 측 검사로 충분하다고 판단했다. 서버 측 강제는
필요해지면 별도 단계로 남긴다.

## 오프라인 액션 큐

알림 액션은 네트워크 호출 **전에** `localStorage`(`lifeapp.pendingNotificationActions`)에 먼저 기록되고,
서버가 확정 응답을 준 뒤에만 큐에서 제거된다:

```js
{ id, goalId, action, scheduleVersion, kind, actedAt, retryCount, lastError }
```

- 액션 수신 즉시 큐에 추가 → 즉시 처리 시도(`processQueue`)
- 실패하면 큐에 남기고 `retryCount` 증가, `resume`/앱 시작 시점마다 재시도
- `scheduleVersion`이 오래된 항목은 재시도 없이 드롭(서버에 반영 안 함)
- **5회** 재시도 후에도 실패하면 더 이상 자동 재시도하지 않고 배너로 "일부 알림 응답을 서버에 반영하지
  못했어요" 안내 — 항목은 큐에 남겨두고 조용히 버리지 않는다
- `GET /today`/`PATCH /transition` 둘 다 이미 멱등하므로(occurrenceKey, 동일 `to` 재요청 no-op) 큐를
  재시도해도 중복 반영될 위험이 없다 — 새 방어 로직 불필요
- 개발용 "지금 테스트" 버튼(`intervention-ui.js`)은 이 큐를 전혀 거치지 않는다 — 별도 경로로 애초에
  분리돼 있다

새 의존성(예: `@capacitor/preferences`) 없이 WebView에 기본 내장된 `localStorage`만 사용한다.

## 앱 종료 상태의 알림 액션 처리 — 조사 결과

`@capacitor/local-notifications`의 공개 API를 검토한 결과, 액션을 무음으로(화면을 전혀 안 띄우고) 처리하는
옵션은 없다 — 액션이 눌리면 항상 연결된 Activity를 앞으로 가져오는 방식으로 동작하는 것으로 보인다(플러그인
타입 정의/문서 기준, 실기기로 아직 검증 안 됨). 따라서:

- 포그라운드: 문제 없음
- 백그라운드/완전 종료: 앱이 (짧게라도) 화면에 나타날 가능성이 높음 — 실기기 확인 필요
- 화면 잠금: 실기기 확인 전엔 단정 불가
- 네트워크 끊김: 위 오프라인 큐로 해결됨(이전엔 유실됐음)

**커스텀 `BroadcastReceiver`(완전 무음 백그라운드 처리)는 이번 단계에서 만들지 않는다** — 위 조사만으로는
필요성을 판단할 근거가 부족하고, 실기기 테스트(`docs/ANDROID_DEVICE_TEST.md`) 결과가 나온 뒤 정말
불충분하다고 확인되면 별도 단계로 제안한다.
