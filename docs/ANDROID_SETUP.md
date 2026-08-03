# Android 로컬 빌드·실행 가이드

이 저장소를 만든 원격 환경엔 Android SDK가 없어서, `npx cap add android`로 네이티브 프로젝트 골격
(`android/`)까지만 생성하고 설정 파일·권한·알림 코드를 준비해뒀다. **실제 APK 빌드, 에뮬레이터/실기기
실행, 알림 수신 확인은 아래 절차대로 로컬 Android Studio에서 진행한다.**

## 0. 필요한 것

- [Android Studio](https://developer.android.com/studio) 최신 버전(설치 시 Android SDK, 플랫폼 툴, 최소
  하나의 시스템 이미지가 함께 설치됨)
- Java는 Android Studio에 내장된 JDK를 그대로 쓰면 됨(별도 설치 불필요)
- Node.js 18+ (이미 이 저장소 개발에 쓰던 것과 동일)

## 1. 프로젝트 준비

```bash
git clone <이 저장소> && cd eunyu-sound-site
npm install
```

## 2. 어떤 서버를 앱이 바라볼지 정하기

이 앱은 웹 자산을 번들하지 않고 `capacitor.config.ts`의 `server.url`이 가리키는 **배포된 사이트를
그대로** WebView에 띄운다(이유는 `docs/DECISIONS.md` "3차" 항목 참고). 기본값은 현재 PR 프리뷰 배포
URL이다 — `main`에 병합되어 정식 프로덕션 도메인이 생기면 `capacitor.config.ts`의 `DEFAULT_SERVER_URL`을
그 도메인으로 바꿔야 한다.

로컬 백엔드(`npm start`, 포트 3000)로 테스트하고 싶다면 매번 `CAPACITOR_SERVER_URL`을 지정해서 동기화한다
(Android 에뮬레이터에서 호스트 머신은 `10.0.2.2`):

```bash
CAPACITOR_SERVER_URL=http://10.0.2.2:3000 npx cap sync android
```

프로덕션/프리뷰 URL로 되돌리려면 환경변수 없이 `npx cap sync android`만 다시 실행하면 된다.

## 3. 프로젝트 동기화 및 열기

```bash
npm run android:sync   # = npx cap sync android
npm run android:open   # = npx cap open android (Android Studio가 열림)
```

`cap sync`는 `android/`에 플러그인(`@capacitor/local-notifications`, `@capacitor/app`)의 네이티브 코드를
반영하고, `public/`을 `android/app/src/main/assets/public`에 복사한다(단, `server.url`이 설정돼 있으면
실제로는 로드되지 않는 껍데기 — 위 2번 참고).

## 4. 실기기 또는 에뮬레이터에서 실행

Android Studio가 열리면:

1. 상단 기기 선택 드롭다운에서 에뮬레이터(없으면 Device Manager에서 새로 생성, API 33 이상 권장 — 알림
   권한 플로우를 확인하려면 필수) 또는 USB로 연결된 실기기(개발자 옵션 → USB 디버깅 켜야 함) 선택
2. ▶ Run 버튼

## 5. 디버그 APK만 따로 만들기

```bash
cd android
./gradlew assembleDebug
```

생성 위치: `android/app/build/outputs/apk/debug/app-debug.apk`. `adb install -r app-debug.apk`로 연결된
기기/에뮬레이터에 설치 가능.

(릴리스 서명·배포 자동화는 이번 범위 밖 — 필요해지면 별도로 다룬다.)

## 6. 알림 권한 설정 확인

- **알림 표시 권한(Android 13+)**: 앱에서 리마인더를 처음 켤 때 시스템 다이얼로그가 자동으로 뜬다. 거부한
  경우 홈 화면에 안내 배너가 뜨고 "권한 요청" 버튼으로 다시 시도할 수 있다. 수동으로 켜려면:
  설정 → 앱 → 내 인생 정리 → 알림 → 허용
- **정확한 알람 권한(Android 12+)**: 없으면 알림이 몇 분 정도 늦게 올 수 있다(inexact 스케줄로 자동
  폴백). 홈 화면 배너의 "설정 열기" 버튼을 누르면 관련 설정 화면으로 바로 이동한다. 수동 경로는 기기
  Android 버전에 따라 다르지만 보통: 설정 → 앱 → 내 인생 정리 → 알람 및 리마인더 (Android 12~13) 또는
  설정 → 특별한 앱 액세스 → 알람 및 리마인더 → 내 인생 정리 (Android 14+)

## 7. 문제 발생 시 로그 확인

```bash
adb logcat | grep -iE "capacitor|localnotif|lifeapp"
```

- `Capacitor` 태그: 플러그인 로드, WebView 콘솔 로그(우리 어댑터의 `console.error`/`console.warn`도 여기
  찍힘)
- `LocalNotifications` 관련 태그: 스케줄/취소/권한 관련 네이티브 로그
- Chrome에서 `chrome://inspect/#devices`로 실기기/에뮬레이터의 WebView를 원격 디버깅하면 일반 웹처럼
  DevTools 콘솔·네트워크 탭을 그대로 쓸 수 있음(가장 편함)

## 8. 알아둘 것

- `android/app/src/androidTest`, `android/app/src/test`의 `ExampleInstrumentedTest.java`/
  `ExampleUnitTest.java`는 Capacitor 템플릿이 기본으로 만든 예제 파일이라 패키지명이 실제 appId
  (`com.eunyusound.lifeorganizer`)와 다르게 보일 수 있다 — 기능과 무관, 무시하거나 삭제해도 된다.
- 상태 표시줄 알림 아이콘은 아직 기본 런처 아이콘을 그대로 쓴다. 커스텀하려면 Android Studio의
  `Image Asset` 도구(우클릭 `res` → New → Image Asset → Notification Icons)로 단색 아이콘을 생성해
  `android/app/src/main/res/drawable/`에 추가하고, `capacitor.config.ts`의 `LocalNotifications.smallIcon`에
  그 파일명(확장자 제외)을 지정한다.
