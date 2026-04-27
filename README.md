# 취약점 관리 시스템

React + Vite + Supabase 기반의 취약점 관리 웹 애플리케이션입니다.  
정보자산 등록부터 점검 기준 관리, 점검 대상 확정, 점검 결과 등록, 취약점 조치 관리, 보고서 생성까지 하나의 흐름으로 관리합니다.

배포 주소:
- `https://sanghakbae.github.io/vuln-mgmt-system/`

저장소:
- `https://github.com/sanghakbae/vuln-mgmt-system`

사내 공지 자료:
- `docs/groupware-vuln-mgmt-system-announcement.md`
- `docs/assets/vuln-mgmt-system-guide.gif`

## 1. 주요 기능

- Google OAuth 기반 로그인
- 정보자산 등록, 수정, 엑셀 Import/Export
- 유형별 점검 기준 관리
- 점검 대상 선정 및 확정
- 점검 결과 등록 및 스크립트 결과 Import
- 취약점 조치 상태 관리
- 결과 보고서 생성 및 미리보기
- 인증 및 보안 설정
- 접근 권한 관리
- 감사 이력(Security Audit Logs) 조회

## 2. 프로세스

현재 앱은 아래 순서로 사용하는 구조입니다.

1. 정보자산 관리
2. 유형별 점검 기준
3. 점검 대상 관리
4. 점검 결과 등록
5. 취약점 관리
6. 보고서 관리

각 단계는 이전 단계가 확정되어야 다음 단계가 활성화됩니다.

예시:
- 정보자산 확정 후 `유형별 점검 기준` 활성화
- 유형별 점검 기준 확정 후 `점검 대상 관리` 활성화
- 점검 대상 확정 후 `점검 결과 등록` 활성화
- 점검 결과 확정 후 `취약점 관리` 활성화
- 취약점 확정 후 `보고서 관리` 활성화

확정 상태는 브라우저 로컬 상태가 아니라 DB 공용 상태를 사용하도록 설계되어 있으며, 새로고침이나 브라우저 변경 후에도 유지되도록 구성되어 있습니다.

## 3. 기술 스택

- Frontend: React 18, Vite 5
- Styling: Tailwind CSS
- Backend/BaaS: Supabase
- Auth: Supabase Auth + Google OAuth
- Data Import/Export: `xlsx`, `papaparse`
- Deploy: GitHub Actions + GitHub Pages

## 4. 프로젝트 구조

```text
.
├─ src/
│  ├─ layout/
│  ├─ pages/
│  │  ├─ LoginPage.jsx
│  │  ├─ DashboardPage.jsx
│  │  ├─ AssetsPage.jsx
│  │  ├─ ChecklistPage.jsx
│  │  ├─ TargetRegistrationPage.jsx
│  │  ├─ InspectionPage.jsx
│  │  ├─ VulnerabilitiesPage.jsx
│  │  ├─ ReportPage.jsx
│  │  ├─ SecurityPage.jsx
│  │  ├─ AccessControlPage.jsx
│  │  └─ AuditPage.jsx
│  ├─ constants/
│  ├─ lib/
│  ├─ utils/
│  └─ App.jsx
├─ supabase/
│  ├─ assets.sql
│  └─ workflow_confirmations.sql
├─ docs/
│  ├─ groupware-vuln-mgmt-system-announcement.md
│  └─ assets/
│     └─ vuln-mgmt-system-guide.gif
├─ scripts/
│  ├─ update_check_items_copy.mjs
│  └─ create_gif_from_screenshots.m
├─ .github/workflows/
│  └─ deploy.yml
└─ vite.config.js
```

### 4.1 사내 공지 자료

사내 그룹웨어 공지에 바로 사용할 수 있는 Markdown 문서와 실제 화면 기준 안내 GIF를 함께 제공합니다.

- 게시글 초안: [docs/groupware-vuln-mgmt-system-announcement.md](docs/groupware-vuln-mgmt-system-announcement.md)
- 실제 화면 안내 GIF: [docs/assets/vuln-mgmt-system-guide.gif](docs/assets/vuln-mgmt-system-guide.gif)

안내 GIF는 로컬에서 실행한 실제 화면을 캡처해 생성한 자료이며, 아래 스크립트로 다시 만들 수 있습니다.

```bash
clang -fobjc-arc -framework AppKit -framework ImageIO scripts/create_gif_from_screenshots.m -o /tmp/create_gif_from_screenshots
/tmp/create_gif_from_screenshots docs/assets/vuln-mgmt-system-guide.gif <frame1.png> <frame2.png> ...
```

## 5. 로컬 실행 방법

### 5.1 의존성 설치

```bash
npm install
```

### 5.2 환경변수 설정

`.env.example`를 복사해 `.env`를 만든 뒤 Supabase 값을 입력합니다.

```bash
cp .env.example .env
```

`.env`

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 5.3 개발 서버 실행

```bash
npm run dev
```

기본 주소:
- `http://localhost:5173/`

### 5.4 프로덕션 빌드

```bash
npm run build
```

### 5.5 로컬 프리뷰

```bash
npm run preview
```

## 6. Supabase 필수 설정

이 프로젝트는 Supabase 연결이 필수입니다.  
환경변수만 넣는다고 끝나지 않고, DB 테이블/정책/URL 설정까지 맞춰야 정상 동작합니다.

### 6.1 필수 환경변수

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

### 6.2 SQL 실행

Supabase SQL Editor에서 아래 파일을 실행해야 합니다.

1. `supabase/assets.sql`
2. `supabase/workflow_confirmations.sql`

#### `supabase/assets.sql`

정보자산 테이블 기본 구조를 생성합니다.

주요 컬럼:
- `asset_code`
- `asset_type`
- `hostname`
- `ip_address`
- `os_version`
- `related_service`
- `purpose`
- `location`
- `department`
- `owner_name`
- `manager_name`
- `confidentiality`
- `integrity`
- `availability`
- `criticality_score`
- `criticality_grade`
- `status`

#### `supabase/workflow_confirmations.sql`

단계별 확정 상태를 공용으로 저장합니다.

관리 대상 단계:
- `assets`
- `checklist`
- `inspection`
- `inspectionResult`
- `vuln`

이 테이블이 없으면:
- 확정 버튼은 눌린 것처럼 보여도
- 사용자별로 상태가 다르게 보이거나
- 새로고침 후 풀린 것처럼 보일 수 있습니다.

### 6.3 권한 및 정책

실제 운영에서는 최소 아래가 필요합니다.

- `assets` 읽기/쓰기 가능
- `workflow_confirmations` 읽기/쓰기 가능
- `users` 읽기/업데이트 가능
- `security_audit_logs` insert 가능

특히 `users` 테이블 정책이 잘못되면 Google OAuth 로그인 후 다음 오류가 발생할 수 있습니다.

```text
Database error saving new user
```

### 6.4 도메인 차단 트리거 주의

과거에 `auth.users`에 남아 있던 `check_domain_trigger` 때문에 Gmail 로그인 시 신규 사용자 저장이 막힌 사례가 있었습니다.

만약 OAuth는 성공하는데 로그인 직후 아래 에러가 반복되면 DB 트리거를 의심해야 합니다.

```text
Database error saving new user
```

## 7. Google OAuth 설정

### 7.1 앱 코드 동작

로그인 화면은 [src/pages/LoginPage.jsx](/Users/shbae-pc/Tools/vuln-mgmt-system/src/pages/LoginPage.jsx)에서 Google OAuth를 사용합니다.

현재 동작:
- `prompt: 'select_account'`
- `redirectTo`는 현재 배포 경로를 포함한 URL 사용
- 허용 계정은 앱 내부에서 `security_settings.allowed_domains` 기준으로 검증

### 7.2 Google Cloud 설정

OAuth 클라이언트는 아래 조건이 맞아야 합니다.

- 애플리케이션 유형: `웹 애플리케이션`
- 승인된 리디렉션 URI:

```text
https://gfybyxbrmkwbzuyhyqiv.supabase.co/auth/v1/callback
```

### 7.3 OAuth 동의 화면

- 사용자 유형: `외부`
- 테스트 단계에서는 외부 Gmail 계정을 `테스트 사용자`에 추가해야 함
- 공개 운영 시에는 앱 게시 상태로 전환하는 것이 맞음

### 7.4 Supabase Auth URL 설정

#### 로컬 개발 기준

`Site URL`

```text
http://localhost:5173/
```

`Redirect URLs`

```text
http://localhost:5173/
```

#### GitHub Pages 배포 기준

`Site URL`

```text
https://sanghakbae.github.io/vuln-mgmt-system/
```

`Redirect URLs`

```text
https://sanghakbae.github.io/vuln-mgmt-system/
http://localhost:5173/
```

주의:
- `https://gfybyxbrmkwbzuyhyqiv.supabase.co/auth/v1/callback` 는 Supabase URL 설정에 넣는 값이 아님
- 이 값은 Google Cloud의 승인된 리디렉션 URI에만 등록해야 함

## 8. GitHub Pages 배포

### 8.1 현재 배포 방식

GitHub Actions + GitHub Pages를 사용합니다.

관련 파일:
- `.github/workflows/deploy.yml`
- `vite.config.js`

### 8.2 Vite base 경로

이 저장소는 GitHub Pages 하위 경로로 배포되므로 `vite.config.js`에 아래가 설정되어 있습니다.

```js
base: '/vuln-mgmt-system/'
```

### 8.3 GitHub Actions Secret

저장소 `Settings > Secrets and variables > Actions`에 아래 두 개를 등록해야 합니다.

1. `VITE_SUPABASE_URL`
2. `VITE_SUPABASE_ANON_KEY`

예:

`VITE_SUPABASE_URL`

```text
https://gfybyxbrmkwbzuyhyqiv.supabase.co
```

`VITE_SUPABASE_ANON_KEY`

```text
Supabase anon key 전체 값
```

### 8.4 GitHub Pages 설정

저장소 `Settings > Pages`에서:

- Source: `GitHub Actions`

### 8.5 배포 트리거

`main` 브랜치 push 시 자동 배포됩니다.

```bash
git push origin main
```

### 8.6 배포 확인

배포 URL:

```text
https://sanghakbae.github.io/vuln-mgmt-system/
```

## 9. 메뉴별 설명

### 9.1 Dashboard

- 전체 자산 수
- 점검 대상 수
- 취약 건수
- 최근 점검 결과
- 최근 조치 현황
- 최근 보고서 생성 이력

### 9.2 정보자산 관리

- 자산 등록
- 자산 편집
- 엑셀 Import/Export
- 검색/필터
- 정보자산 확정

특징:
- CIA(기밀성/무결성/가용성)로 중요도 자동 계산
- 자산 클릭 시 행 아래에서 편집
- 등록은 팝업 방식
- 초기 렌더 속도를 위해 캐시 + 백그라운드 재조회 사용

### 9.3 유형별 점검 기준

- 점검 항목 등록
- 점검 항목 수정
- 위험도/점검방식/사용여부 관리
- 확정 후 다음 단계 활성화

### 9.4 점검 대상 관리

- 정보자산 목록에서 점검 대상 선정
- 필터 기반 조회
- 대상 확정

### 9.5 점검 결과 등록

- 항목별 판정 입력
- 상태/결과/조치 상태 관리
- 스크립트 결과 Import
- 결과 확정

### 9.6 취약점 관리

- 취약점별 조치 상태 관리
- 상세 현황, 판정 근거, 조치 내용 확인
- 취약점 확정

### 9.7 보고서 관리

- 보고서 생성
- HTML/PDF 출력
- 결과보고서 미리보기

### 9.8 인증 및 보안 설정

- 세션 타임아웃
- Google OAuth 사용 여부
- 허용 도메인 설정

### 9.9 접근 권한 관리

- 사용자 역할 조회
- 권한 변경

### 9.10 감사 이력

- 보안 관련 변경 이력 조회
- 상세 로그 확인

## 10. 데이터 Import / Export

### 10.1 정보자산 Import

정보자산 관리는 엑셀 기반 Import를 지원합니다.

처리 규칙:
- 시트 이름 기준으로 자산 유형 구분
- `asset_code`가 있으면 upsert
- `asset_code`가 없으면 insert
- `status`는 기본 `운영`
- `criticality_score`, `criticality_grade`는 CIA 기반 계산값 사용

매핑 예시:
- `SERVER 시트` → `SERVER`
- `DATABASE 시트` → `DATABASE`
- `WEB_APP 시트` → `WEB_APP`
- `WAS 시트` → `WAS`
- `NETWORK 시트` → `NETWORK`
- `SECURITY 시트` → `SECURITY`
- `ETC 시트` → `ETC`

### 10.2 정보자산 Export

현재 목록을 엑셀로 내보낼 수 있습니다.

## 11. 세션 및 인증 동작

### 11.1 세션 타임아웃

[src/App.jsx](/Users/shbae-pc/Tools/vuln-mgmt-system/src/App.jsx)에서 유휴 세션 타이머를 관리합니다.

활동 감지 이벤트:
- `mousemove`
- `mousedown`
- `keydown`
- `scroll`
- `touchstart`
- `click`

설정 시간 동안 사용자 활동이 없으면:
- 감사 로그 기록
- 세션 만료 알림
- 강제 로그아웃

### 11.2 로그아웃

로그아웃은 `supabase.auth.signOut({ scope: 'global' })`를 사용합니다.

### 11.3 사용자 동기화

로그인 직후:
- `security_settings` 조회
- 허용 도메인 검증
- `users` 테이블 upsert
- 현재 사용자 역할 반영

## 12. 성능 관련 메모

최근 반영된 내용:
- Dashboard 요약 캐시
- 정보자산 관리 `localStorage` 캐시
- 로그인 직후 자산 목록 warmup
- 일부 무거운 `select('*')` 축소
- 중복 조회 제거

주의:
- 대시보드는 요약 쿼리 위주라 빠르고
- 정보자산 목록은 실제 행 데이터를 읽어오기 때문에 상대적으로 느릴 수 있습니다
- 현재는 캐시를 먼저 보여주고 최신값으로 갱신하는 구조입니다

## 13. 자주 발생했던 문제와 원인

### 13.1 Google 로그인 후 다시 로그인 페이지로 돌아감

주요 원인:
- Supabase `Site URL` / `Redirect URLs` 설정 오류
- GitHub Pages 경로(`/vuln-mgmt-system/`) 누락
- OAuth 동의 화면 테스트 사용자 설정 문제

### 13.2 `Database error saving new user`

주요 원인:
- `users` 테이블 정책 문제
- `auth.users`에 붙은 커스텀 트리거 실패
- 과거 `check_domain_trigger` 충돌

### 13.3 배포 후 흰 화면

주요 원인:
- GitHub Actions Secret 미설정
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` 누락
- Pages 배포 미완료

### 13.4 GitHub Pages 404

주요 원인:
- `Settings > Pages`에서 `GitHub Actions` 미설정
- Actions 배포 실패

## 14. 운영 체크리스트

배포 전 체크:

- `.env` 값이 올바른 Supabase 프로젝트를 가리키는지 확인
- `supabase/assets.sql` 실행
- `supabase/workflow_confirmations.sql` 실행
- GitHub Secrets 등록
- Supabase Auth URL을 배포 주소로 설정
- Google OAuth Redirect URI 확인
- GitHub Pages Source를 `GitHub Actions`로 설정

배포 후 체크:

- 로그인 성공 여부
- 정보자산 목록 조회 여부
- 확정 상태 공용 반영 여부
- 보고서 생성 여부
- 감사 로그 적재 여부

## 15. 개발 메모

- 배포 base 경로는 `/vuln-mgmt-system/`
- 로컬 테스트는 `http://localhost:5173/`
- 배포와 로컬이 같은 Supabase 프로젝트를 볼 수도 있으므로 운영/개발 분리 여부를 반드시 의식해야 함
- `scripts/update_check_items_copy.mjs`는 점검 항목 설명/판정 기준/조치 방안 정리 작업용 스크립트입니다

## 16. 실행 명령 요약

```bash
npm install
cp .env.example .env
npm run dev
```

```bash
npm run build
```

```bash
git push origin main
```
