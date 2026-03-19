# Vulnerability Management UI

## 실행

```bash
npm install
cp .env.example .env
npm run dev
```

## Supabase 설정

1. Supabase SQL Editor에서 `supabase/assets.sql` 실행
2. `.env`에 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` 입력

## CSV Import

- 메뉴: 정보자산 관리
- 버튼: CSV Import
- 파일 형식: `public/assets_sample.csv` 참고
- 저장 방식: `asset_code` 기준 upsert
- 중요도: 기밀성 + 무결성 + 가용성으로 자동 계산

환경변수를 설정하지 않으면 mock 데이터로 동작합니다.
