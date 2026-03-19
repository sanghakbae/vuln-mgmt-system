import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

const ADMIN_EMAIL_FALLBACKS = ['shbae@muhayu.com'];

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
    <div className="space-y-1 text-xs leading-5 text-slate-700">
      {entries.map(([key, value]) => (
        <div key={key} className="flex items-start gap-2">
          <span className="min-w-[92px] shrink-0 font-medium text-slate-500">
            {formatAuditLabel(key)}
          </span>
          <span className="break-words">{formatAuditValue(value)}</span>
        </div>
      ))}
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
        관리자만 접근할 수 있습니다.
      </div>
    </div>
  );
}

export default function AuditPage() {
  const [roleLoading, setRoleLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    checkRole();
  }, []);

  useEffect(() => {
    if (isAdmin) {
      loadLogs();
    }
  }, [isAdmin]);

  async function checkRole() {
    try {
      setRoleLoading(true);

      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;

      const email = authData?.user?.email || '';
      const userId = authData?.user?.id;

      if (!userId) {
        setIsAdmin(false);
        return;
      }

      const { data, error } = await supabase
        .from('users')
        .select('role,email')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        console.error('권한 조회 실패:', error.message);
      }

      const admin =
        data?.role === 'admin' ||
        ADMIN_EMAIL_FALLBACKS.includes(email) ||
        ADMIN_EMAIL_FALLBACKS.includes(data?.email || '');

      setIsAdmin(Boolean(admin));
    } catch (err) {
      console.error('권한 확인 실패:', err);

      try {
        const { data: authData } = await supabase.auth.getUser();
        const email = authData?.user?.email || '';
        setIsAdmin(ADMIN_EMAIL_FALLBACKS.includes(email));
      } catch {
        setIsAdmin(false);
      }
    } finally {
      setRoleLoading(false);
    }
  }

  async function loadLogs() {
    try {
      setLoading(true);
      setError('');

      const { data, error } = await supabase
        .from('security_audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(300);

      if (error) throw error;
      setRows(data || []);
    } catch (err) {
      console.error(err);
      setError(err.message || '보안 감사 로그 조회 실패');
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

  if (roleLoading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
        권한 확인 중...
      </div>
    );
  }

  if (!isAdmin) {
    return <NoPermission />;
  }

  return (
    <div className="space-y-6">
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
            <thead className="bg-slate-50 text-slate-500">
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
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                    표시할 로그가 없습니다.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100 align-top hover:bg-slate-50">
                    <td className="px-3 py-2 text-center text-slate-700 whitespace-nowrap">
                      {row.created_at
                        ? String(row.created_at).slice(0, 19).replace('T', ' ')
                        : '-'}
                    </td>
                    <td className="px-3 py-2 text-center text-slate-800 whitespace-nowrap">
                      {row.actor_email || '-'}
                    </td>
                    <td className="px-3 py-2 text-center text-slate-700 whitespace-nowrap">
                      {row.action || '-'}
                    </td>
                    <td className="px-3 py-2 text-center text-slate-700 whitespace-nowrap">
                      {row.target_type || '-'}
                      {row.target_id ? ` / ${row.target_id}` : ''}
                    </td>
                    <td className="px-3 py-2 text-left align-middle text-slate-700">
                      <div className="min-w-[340px] rounded-lg bg-slate-50 px-3 py-2">
                        {renderAuditDetail(row.detail)}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
