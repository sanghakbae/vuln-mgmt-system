import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { reportAppError } from '../utils/errorDialog';
import { canViewAuditLogs } from '../utils/securityDefaults';

const PAGE_SIZE = 10;

function formatActionLabel(action) {
  const actionMap = {
    login: '로그인',
    logout: '로그아웃',
    session_timeout_logout: '세션 만료',
    update_security_settings: '보안 설정 변경',
    update_user_role: '권한 변경',
    create_report: '보고서 생성',
    delete_report: '보고서 삭제',
    confirm_assets: '자산 확정',
    confirm_checklist: '기준 확정',
    confirm_inspection: '대상 확정',
    confirm_inspectionResult: '결과 확정',
    confirm_vuln: '취약점 확정',
  };

  return actionMap[action] || action || '-';
}

function getActionTone(action) {
  if (String(action || '').includes('delete')) return 'rose';
  if (String(action || '').includes('update')) return 'amber';
  if (String(action || '').includes('confirm')) return 'emerald';
  if (['login', 'logout'].includes(action)) return 'blue';
  return 'slate';
}

function ActionBadge({ action }) {
  const toneMap = {
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    rose: 'border-rose-200 bg-rose-50 text-rose-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    blue: 'border-sky-200 bg-sky-50 text-sky-700',
    slate: 'border-slate-200 bg-slate-50 text-slate-700',
  };

  const tone = getActionTone(action);

  return (
    <span className={`inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-semibold leading-4 ${toneMap[tone]}`}>
      {formatActionLabel(action)}
    </span>
  );
}

function formatAuditLabel(key) {
  const labelMap = {
    reason: '사유',
    timeout_minutes: '세션 타임아웃',
    old_role: '이전 권한',
    new_role: '변경 권한',
    allowed_domains: '허용 도메인',
    actor_email: '사용자',
    target_type: '대상 유형',
    target_id: '대상 ID',
  };

  return labelMap[key] || key.replace(/_/g, ' ');
}

function formatAuditValue(value) {
  if (value === null || value === undefined || value === '') return '-';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'boolean') return value ? '예' : '아니오';
  if (typeof value === 'object') {
    return Object.entries(value)
      .map(([key, nestedValue]) => `${formatAuditLabel(key)}: ${formatAuditValue(nestedValue)}`)
      .join(' / ');
  }
  return String(value);
}

function renderAuditDetail(detail) {
  const entries = Object.entries(detail || {});

  if (!entries.length) {
    return <span className="text-slate-400">-</span>;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <table className="min-w-full table-fixed text-[11px] text-slate-700">
        <tbody>
          {entries.map(([key, value]) => (
            <tr key={key} className="border-t border-slate-100 first:border-t-0">
              <th className="w-[92px] whitespace-nowrap bg-slate-50 px-1 py-0.5 text-left text-[10px] font-medium text-slate-500 sm:px-1.5 sm:text-[11px]">
                {formatAuditLabel(key)}
              </th>
              <td className="px-1 py-0.5 break-words text-[10px] text-slate-700 sm:px-1.5 sm:text-[11px]">
                {formatAuditValue(value)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Card({ children, className = '' }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {children}
    </div>
  );
}

function NoPermission() {
  return (
    <div className="rounded-xl border border-rose-200 bg-white p-8 text-center shadow-sm">
      <div className="text-lg font-semibold text-slate-900">접근 권한 없음</div>
      <div className="mt-2 text-sm text-slate-500">
        관리자와 감사자만 접근할 수 있습니다.
      </div>
    </div>
  );
}

export default function AuditPage({
  currentUserEmail = '',
  currentUserRole = '',
}) {
  const canView = canViewAuditLogs(currentUserEmail, currentUserRole);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [error, setError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    if (canView) {
      loadLogs();
    }
  }, [canView]);

  async function loadLogs() {
    try {
      setLoading(true);
      setError('');

      const { data, error } = await supabase
        .from('security_audit_logs')
        .select('id,actor_email,action,target_type,target_id,detail,created_at')
        .order('created_at', { ascending: false })
        .limit(300);

      if (error) throw error;
      setRows(data || []);
    } catch (err) {
      reportAppError(err, {
        title: '보안 감사 로그 조회 실패',
        context: 'AuditPage.loadLogs',
        fallbackMessage: '보안 감사 로그 조회 실패',
        setError,
      });
    } finally {
      setLoading(false);
    }
  }

  const filteredRows = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) return rows;

    return rows.filter((row) =>
      [
        row.actor_email,
        row.action,
        row.target_type,
        row.target_id,
        JSON.stringify(row.detail || {}),
        row.created_at,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q))
    );
  }, [rows, keyword]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const currentPageGroup = Math.floor((currentPage - 1) / 10);
  const pageStart = currentPageGroup * 10 + 1;
  const pageEnd = Math.min(totalPages, pageStart + 9);
  const visiblePages = Array.from(
    { length: pageEnd - pageStart + 1 },
    (_, index) => pageStart + index
  );

  const pagedRows = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredRows.slice(start, start + PAGE_SIZE);
  }, [filteredRows, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [keyword]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  if (!canView) {
    return <NoPermission />;
  }

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-lg font-semibold text-slate-900">Security Audit Logs</div>
            <div className="mt-1 text-xs text-slate-500">
              로그인, 로그아웃, 보안 설정 변경, 권한 변경 등 실제 보안 감사 로그를 조회합니다.
            </div>
          </div>

          <div className="flex w-full gap-2 lg:w-auto">
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="이메일, 액션, 대상 검색"
              className="h-8 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none lg:w-[320px]"
            />
            <button
              onClick={loadLogs}
              disabled={loading}
              className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-4 text-xs font-medium text-slate-700 disabled:opacity-50"
            >
              새로고침
            </button>
          </div>
        </div>

        {error && (
          <div className="border-b border-slate-200 px-5 py-3 text-xs text-rose-600">
            {error}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-50 text-slate-900">
              <tr>
                <th className="px-3 py-2 text-center font-bold whitespace-nowrap">시간</th>
                <th className="px-3 py-2 text-center font-bold whitespace-nowrap">사용자</th>
                <th className="px-3 py-2 text-center font-bold whitespace-nowrap">액션</th>
                <th className="px-3 py-2 text-center font-bold whitespace-nowrap">대상</th>
                <th className="px-3 py-2 text-center font-bold whitespace-nowrap">상세</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                    보안 감사 로그를 불러오는 중입니다.
                  </td>
                </tr>
              ) : pagedRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                    표시할 로그가 없습니다.
                  </td>
                </tr>
              ) : (
                pagedRows.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100 align-top hover:bg-slate-50/80">
                    <td className="px-3 py-3 text-center text-slate-700 whitespace-nowrap">
                      <div className="font-mono text-[11px] text-slate-700">
                        {row.created_at
                          ? String(row.created_at).slice(0, 19).replace('T', ' ')
                          : '-'}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center text-slate-800 whitespace-nowrap">
                      <div className="font-medium text-slate-900">{row.actor_email || '-'}</div>
                    </td>
                    <td className="px-3 py-3 text-center text-slate-700 whitespace-nowrap">
                      <ActionBadge action={row.action} />
                    </td>
                    <td className="px-3 py-3 text-center text-slate-700 whitespace-nowrap">
                      <div className="font-medium text-slate-800">{formatAuditLabel(row.target_type || '-') || '-'}</div>
                      <div className="mt-0.5 text-[11px] text-slate-500">
                        {row.target_id ? `ID ${row.target_id}` : 'ID 없음'}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-left align-top text-slate-700">
                      <div className="min-w-[360px] rounded-lg bg-slate-50 p-1">
                        {renderAuditDetail(row.detail)}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3">
          <div className="text-xs text-slate-500">
            총 {filteredRows.length}건 / 페이지 {currentPage} / {totalPages}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="rounded-lg border border-slate-200 px-3 py-1 text-xs text-slate-600 disabled:opacity-50"
            >
              이전
            </button>
            {visiblePages.map((page) => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium ${
                  currentPage === page
                    ? 'bg-slate-900 text-white'
                    : 'border border-slate-200 text-slate-600'
                }`}
              >
                {page}
              </button>
            ))}
            <button
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="rounded-lg border border-slate-200 px-3 py-1 text-xs text-slate-600 disabled:opacity-50"
            >
              다음
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}
