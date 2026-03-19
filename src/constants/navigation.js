// 메뉴 정의
export const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', desc: '전체 현황 요약' },
  { key: 'assets', label: '정보자산 관리', desc: '정보자산 등록 및 목록 관리' },
  { key: 'checklist', label: '유형별 점검 기준', desc: '점검 기준 관리' },
  { key: 'inspection', label: '점검 대상 관리', desc: '점검 대상 자산 선정 및 관리' },
  { key: 'inspectionResult', label: '점검 결과 등록', desc: '점검 결과 등록 및 판정' },
  { key: 'vuln', label: '취약점 관리', desc: '조치 계획 및 결과 관리' },
  { key: 'report', label: '보고서 관리', desc: '보고서 생성 및 이력 관리' },
  { key: 'security', label: '인증 및 보안 설정', desc: '보안 정책 설정' },
  { key: 'access', label: '접근 권한 관리', desc: '사용자 권한 관리' },
  { key: 'audit', label: '감사 이력', desc: '로그 및 변경 이력 조회' },
];

// 페이지 타이틀/설명
export const NAV_META = {
  dashboard: { title: 'Dashboard', desc: '전체 현황 요약' },
  assets: { title: '정보자산 관리', desc: '정보자산을 등록하고 관리합니다.' },
  inspection: { title: '점검 대상 관리', desc: '점검 대상 자산을 선정합니다.' },
  checklist: { title: '유형별 점검 기준', desc: '점검 기준을 설정합니다.' },
  inspectionResult: { title: '점검 결과 등록', desc: '점검 결과를 등록합니다.' },
  vuln: { title: '취약점 관리', desc: '취약점 조치 및 상태를 관리합니다.' },
  report: { title: '보고서 관리', desc: '점검 결과 보고서를 생성합니다.' },
  security: { title: '인증 및 보안 설정', desc: '보안 정책을 관리합니다.' },
  access: { title: '접근 권한 관리', desc: '사용자 권한을 관리합니다.' },
  audit: { title: '감사 이력', desc: '시스템 로그를 조회합니다.' },
};

// 관리자 전용 메뉴
export const ADMIN_ONLY_MENUS = ['security', 'access', 'audit'];
