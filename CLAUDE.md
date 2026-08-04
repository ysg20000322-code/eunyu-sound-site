# eunyu-sound-site

## 오답노트(틀린 문제) 반영 규칙

사용자가 채팅으로 "틀린 문제"를 보내면(예: 문제 내용, 정답, 과목 등을 텍스트로 전달):

- 코드(`wrongnotes.js` 등 관련 파일)에 반영하고 **확인 절차 없이 바로 `main` 브랜치에 push**해서 자동 배포되게 한다.
- 데이터/문항 추가처럼 위험도가 낮은 변경이면 "main에 바로 반영할지 PR로 할지" 같은 질문을 반복해서 하지 않는다. 이 규칙을 기본값으로 따른다.
- 단, 스키마 변경, 삭제성 작업(`rm -rf` 등 파일/디렉토리 삭제), 의존성 변경처럼 되돌리기 어렵거나 파급력이 큰 작업은 여전히 사용자에게 확인받는다.

## 조경기사 오답 등록 규칙

사용자가 조경기사 문제 스크린샷을 첨부하고 "등록해줘", "오답에 넣어줘", "사이트에 추가해줘"와 같이 요청하면:

1. 이미지에 실제로 표시된 정보만 추출한다.
2. 문제, 보기 4개, 정답, 해설을 구조화한다.
3. 과목, 시험일, 문제 번호도 가능한 경우 추출한다.
4. 보이지 않는 내용은 임의로 지어내지 않는다.
5. 필수 정보가 불분명하면 등록 전에 사용자에게 확인한다.
6. `data/reviewproblems.json`이나 Vercel Blob 데이터를 직접 수정하지 않는다.
7. 반드시 `npm run review:import` (= `node scripts/import-review-problem.mjs`)를 사용해서 운영 사이트의 `POST /api/review/import`로만 등록한다.
8. 등록 API의 응답(JSON)을 확인한다.
9. 신규 등록(`action: "created"`)인지 중복 갱신(`action: "duplicate"`)인지, `externalWrongCount`와 `important` 값이 어떻게 되었는지 사용자에게 보고한다.
10. 사용자가 요청하지 않은 Git commit 또는 push는 하지 않는다.

### 스크린샷 분석 후 사용할 JSON 형식

```json
{
  "subject": "조경설계",
  "examDate": "2021-05-15",
  "examLabel": "2021년 5월 15일 기출문제",
  "questionNumber": 41,
  "question": "문제 본문",
  "choices": ["보기 1", "보기 2", "보기 3", "보기 4"],
  "correctAnswer": 3,
  "submittedAnswer": null,
  "explanation": "해설",
  "source": "Claude screenshot import"
}
```

- `subject`는 다음 중 하나여야 한다: 조경사, 조경계획, 조경설계, 조경식재, 조경시공구조학, 조경관리론.
- `choices`는 정확히 4개, `correctAnswer`는 1~4 사이 정수(1-indexed)여야 한다.
- 이미지에 "입력한 답: 0"처럼 미응답으로 보이는 표시가 있으면 `submittedAnswer`는 `0`이 아니라 `null`로 채운다. 사용자가 실제로 오답을 선택한 경우에만 1~4 정수를 넣는다.
- `examDate`, `examLabel`, `questionNumber`는 이미지에서 확인되지 않으면 생략(`null` 또는 필드 자체를 비움)한다.

실행 예시:

```
node scripts/import-review-problem.mjs <<'JSON'
{ ... 위 형식의 JSON ... }
JSON
```

또는 `npm run review:import <<'JSON' ... JSON`.

이 스크립트는 `REVIEW_SITE_URL`, `REVIEW_IMPORT_TOKEN` 환경변수가 설정되어 있어야 동작한다.

## 주의사항

- 저장소 전체나 대량 파일을 지우는 `rm -rf` 같은 명령은 사용자가 명시적으로 요청하지 않는 한 실행하지 않는다.
