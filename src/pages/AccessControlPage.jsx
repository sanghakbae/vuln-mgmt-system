import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { runSupabaseMutation } from '../utils/supabaseMutation';

const ROLE_OPTIONS = ['admin', 'user', 'auditor'];
const ADMIN_EMAIL_FALLBACKS = ['shbae@muhayu.com'];

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

export default function AccessControlPage() {
  const [roleLoading, setRoleLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authUser, setAuthUser] = useState(null);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    checkRole();
  }, []);

  useEffect(() => {
    if (isAdmin) {
      loadUsers();
    }
  }, [isAdmin]);

  async function checkRole() {
    try {
      setRoleLoading(true);

      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;

      const email = authData?.user?.email || '';
      const userId = authData?.user?.id;
      setAuthUser(authData?.user || null);

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
        setAuthUser(authData?.user || null);
        setIsAdmin(ADMIN_EMAIL_FALLBACKS.includes(email));
      } catch {
        setIsAdmin(false);
      }
    } finally {
      setRoleLoading(false);
    }
  }

  async function loadUsers() {
    try {
      setLoading(true);
      setMessage('');
      setError('');

      const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) throw error;
      setRows(data || []);
    } catch (err) {
      console.error(err);
      setError(err.message || '사용자 목록 조회 실패');
    } finally {
      setLoading(false);
    }
  }

  function handleRoleChange(id, role) {
    setRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, role } : row))
    );
  }

  async function insertSecurityAuditLog(action, targetId, detail) {
    try {
      const { data: authData } = await supabase.auth.getUser();
      const actorEmail = authData?.user?.email || 'unknown';

      await runSupabaseMutation(async () => {
        const { error } = await supabase.from('security_audit_logs').insert({
          actor_email: actorEmail,
          action,
          target_type: 'user',
          target_id: String(targetId),
          detail,
        });

        if (error) throw error;
      });
    } catch (err) {
      console.error('security_audit_logs insert 실패:', err);
    }
  }

  async function handleSaveRole(row) {
    try {
      setSavingId(row.id);
      setMessage('');
      setError('');

      if (authUser?.id && row.id === authUser.id) {
        alert('자기 자신의 권한은 변경할 수 없습니다.');
        return;
      }

      await runSupabaseMutation(async () => {
        const { error } = await supabase
          .from('users')
          .update({
            role: row.role,
            updated_at: new Date().toISOString(),
          })
          .eq('id', row.id);

        if (error) throw error;
      });

      await insertSecurityAuditLog('update_user_role', row.id, {
        email: row.email,
        role: row.role,
      });

      setMessage(`${row.email} 권한이 저장되었습니다.`);
      await loadUsers();
    } catch (err) {
      console.error(err);
      setError(err.message || '권한 저장 실패');
    } finally {
      setSavingId(null);
    }
  }

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
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="text-lg font-semibold text-slate-900">Access Control</div>
          <div className="mt-1 text-sm text-slate-500">
            사용자 권한(admin / user / auditor)을 관리합니다.
          </div>
        </div>

        {(message || error) && (
          <div className="border-b border-slate-200 px-5 py-3">
            {message ? (
              <div className="text-sm text-emerald-600">{message}</div>
            ) : (
              <div className="text-sm text-rose-600">{error}</div>
            )}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left font-bold whitespace-nowrap">이메일</th>
                <th className="px-3 py-2 text-left font-bold whitespace-nowrap">이름</th>
                <th className="px-3 py-2 text-center font-bold whitespace-nowrap">권한</th>
                <th className="px-3 py-2 text-center font-bold whitespace-nowrap">최근 로그인</th>
                <th className="px-3 py-2 text-center font-bold whitespace-nowrap">저장</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                    사용자 목록을 불러오는 중입니다.
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                    표시할 사용자가 없습니다.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2 text-left text-slate-800 whitespace-nowrap">
                      {row.email}
                    </td>
                    <td className="px-3 py-2 text-left text-slate-700 whitespace-nowrap">
                      {row.name || '-'}
                    </td>
                    <td className="px-3 py-2 text-center whitespace-nowrap">
                      <select
                        value={row.role}
                        onChange={(e) => handleRoleChange(row.id, e.target.value)}
                        disabled={authUser?.id === row.id}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none disabled:bg-slate-100 disabled:text-slate-400"
                      >
                        {ROLE_OPTIONS.map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-center text-slate-700 whitespace-nowrap">
                      {row.last_login
                        ? String(row.last_login).slice(0, 19).replace('T', ' ')
                        : '-'}
                    </td>
                    <td className="px-3 py-2 text-center whitespace-nowrap">
                      <button
                        onClick={() => handleSaveRole(row)}
                        disabled={savingId === row.id || authUser?.id === row.id}
                        className="rounded-lg bg-slate-950 px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        {savingId === row.id ? '저장 중...' : '저장'}
                      </button>
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
