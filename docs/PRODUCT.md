# 목표 행동 개입(Intervention) — 제품 개요

## 목적

메인 목표에 "매일 정해진 시각에 행동을 시작하라"는 리마인더를 붙여서, 목표를 세우는 것에서 그치지 않고
매일의 실행을 관리하게 한다. 예: "매일 19시에 운동하기" — 19시가 되면 앱이 "시작 / 5분 미루기 /
건너뛰기"를 묻고, 그 결과를 하루 단위 기록으로 남긴다.

## 이번 단계(1차: 도메인+백엔드)의 범위

- Goal에 `behavior`(반복 스케줄) 설정 추가
- 하루치 실행 회차(GoalExecution)를 멱등하게 생성·조회하는 API
- 시작/미루기/건너뛰기/완료 등 상태 전이와 그 검증
- 타임존 처리, 목표 시각 변경 시 과거 기록 불변
- 개발용 수동 트리거(테스트 UI가 실제 스케줄 시각을 기다리지 않고 개입 상태를 확인할 수 있게)
- 자동/수동 테스트, 문서화

**포함하지 않음(비목표, 이후 단계):** 실제 Web Push/Vercel Cron을 통한 정시 발송, Capacitor 설치와
네이티브 로컬 알림, 캐릭터 친밀도/스킨/재화 시스템, LLM 대화, 기존 API 전체 리팩터링, `checkins` 삭제.

## 2차(프론트/상호작용)에서 이어질 것 (이번엔 미구현)

목표 설정 UI에서 스케줄(시각/타임존) 입력, 홈 화면에 오늘의 행동 상태 표시, 개발용 "지금 테스트" 버튼,
캐릭터가 등장하는 개입 모달, 시작/미루기/건너뛰기 버튼과 터치·키보드 접근성, 새로고침 후 상태 복구,
완료 애니메이션, 홈 화면 반영. 여기서 만든 `public/intervention-engine.js`와 `/api/goal-executions` API를
그대로 재사용하고, 새로 만드는 건 UI/전달 계층뿐이다.

## 3차(Capacitor Android + 로컬 알림): 자동 테스트 통과, **실기기 미검증**

앱을 닫아도 실제 폰 알림이 오도록 Android 전용 셸을 만들고 `@capacitor/local-notifications`를 붙였다.
`public/intervention-engine.js`/`routes/goalExecutions.js`는 무변경 — 새 파일
`public/capacitor-notification-adapter.js`가 예약/취소/권한/액션수신만 담당하는 얇은 전달 계층으로
추가됐다(자세한 구조는 `docs/DOMAIN.md`, 아키텍처 결정은 `docs/DECISIONS.md`). iOS, Web Push, Vercel Cron,
오버레이/자유이동 캐릭터, LLM 대화, 친밀도·재화·스킨 시스템, 스토어 출시·서명 자동화는 이번에도 제외.

**"완료"와 "검증 완료"를 구분한다**: `npm test`(자동 테스트)와 데스크톱 브라우저 스모크는 통과했지만,
이 원격 개발 환경엔 Android SDK가 없어 실제 APK 빌드·알림 수신·권한 플로우는 **아직 실기기에서 확인된
적이 없다.** `docs/ANDROID_DEVICE_TEST.md`의 체크리스트가 전부 통과로 채워지기 전까지는 "Android 기능
완료"로 간주하지 않는다 — 로컬 Android Studio에서 `docs/ANDROID_SETUP.md` 절차대로 진행 필요.

## 3.5차(외부 검토 반영): scheduleVersion, 알림 extra 확장, 오프라인 액션 큐

ChatGPT 검토를 반영해 3차의 알림 전달 계층만 보완했다(GoalExecution/occurrenceKey/상태전이/
InterventionEngine 구조는 무변경): 알림 `extra`에 `kind`/`scheduleVersion`/`occurrenceKey` 추가, 목표
시각 변경 후 남아있는 오래된 알림이 GoalExecution을 잘못 바꾸지 못하게 방어, 오프라인 상태에서 누른
알림 액션을 `localStorage` 큐에 보존했다가 재시도. `server.url` 방식이 스토어 출시용 구조가 아니라는
점을 `docs/ANDROID_ARCHITECTURE.md`에 명시했다. 실기기 테스트 체크리스트는
`docs/ANDROID_DEVICE_TEST.md`에 정리(전부 미검증 상태로 시작).
