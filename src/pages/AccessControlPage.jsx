import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { runSupabaseMutation } from '../utils/supabaseMutation';
import { reportAppError } from '../utils/errorDialog';
import { isAdminUser, resolveUserRole, ROLE_OPTIONS } from '../utils/securityDefaults';

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

function getRoleSelectClass(role) {
  const toneMap = {
    admin: 'border-rose-200 bg-rose-50 text-rose-700',
    auditor: 'border-amber-200 bg-amber-50 text-amber-700',
    user: 'border-sky-200 bg-sky-50 text-sky-700',
    viewer: 'border-slate-200 bg-slate-50 text-slate-700',
  };

  return toneMap[role] || 'border-slate-200 bg-white text-slate-700';
}

export default function AccessControlPage({
  currentUserEmail = '',
  currentUserRole = '',
  currentUserId = null,
}) {
  const isAdmin = isAdminUser(currentUserEmail, currentUserRole);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (isAdmin) {
      loadUsers();
    }
  }, [isAdmin]);

  async function loadUsers() {
    try {
      setLoading(true);
      setMessage('');
      setError('');

      const { data, error } = await supabase
        .from('users')
        .select('id,email,name,role,last_login,created_at')
        .order('created_at', { ascending: true });

      if (error) throw error;
      setRows(
        (data || []).map((row) => ({
          ...row,
          role: resolveUserRole(row.role, row.email),
        }))
      );
    } catch (err) {
      reportAppError(err, {
        title: '사용자 목록 조회 실패',
        context: 'AccessControlPage.loadUsers',
        fallbackMessage: '사용자 목록 조회 실패',
        setError,
      });
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
      const actorEmail = currentUserEmail || 'unknown';

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
      reportAppError(err, {
        title: '권한 변경 감사 로그 저장 실패',
        context: 'AccessControlPage.insertSecurityAuditLog',
        fallbackMessage: '권한 변경 감사 로그 저장 실패',
      });
    }
  }

  async function handleSaveRole(row) {
    try {
      setSavingId(row.id);
      setMessage('');
      setError('');

      if (currentUserId && row.id === currentUserId) {
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
      const fallbackMessage =
        err?.code === '23514'
          ? '권한 저장 실패: users.role 제약조건이 viewer를 허용하지 않습니다. supabase/users_role_viewer.sql을 먼저 실행하세요.'
          : '권한 저장 실패';

      reportAppError(err, {
        title: '권한 저장 실패',
        context: 'AccessControlPage.handleSaveRole',
        fallbackMessage,
        setError,
      });
    } finally {
      setSavingId(null);
    }
  }

  async function handleDeleteUser(row) {
    try {
      setDeletingId(row.id);
      setMessage('');
      setError('');

      if (currentUserId && row.id === currentUserId) {
        alert('자기 자신의 계정은 삭제할 수 없습니다.');
        return;
      }

      const confirmed = window.confirm(`${row.email} 계정을 삭제하시겠습니까?`);
      if (!confirmed) return;

      await runSupabaseMutation(async () => {
        const { error } = await supabase
          .from('users')
          .delete()
          .eq('id', row.id);

        if (error) throw error;
      });

      await insertSecurityAuditLog('delete_user', row.id, {
        email: row.email,
        role: row.role,
      });

      setMessage(`${row.email} 계정이 삭제되었습니다.`);
      await loadUsers();
    } catch (err) {
      reportAppError(err, {
        title: '계정 삭제 실패',
        context: 'AccessControlPage.handleDeleteUser',
        fallbackMessage: '계정 삭제 실패',
        setError,
      });
    } finally {
      setDeletingId(null);
    }
  }

  if (!isAdmin) {
    return <NoPermission />;
  }

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="text-lg font-semibold text-slate-900">Access Control</div>
          <div className="mt-1 text-sm text-slate-500">
            사용자 권한(admin / auditor / user / viewer)을 관리합니다.
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
                <th className="px-3 py-2 text-center font-bold whitespace-nowrap">이메일</th>
                <th className="px-3 py-2 text-center font-bold whitespace-nowrap">이름</th>
                <th className="px-3 py-2 text-center font-bold whitespace-nowrap">권한</th>
                <th className="px-3 py-2 text-center font-bold whitespace-nowrap">최초 로그인</th>
                <th className="px-3 py-2 text-center font-bold whitespace-nowrap">최근 로그인</th>
                <th className="px-3 py-2 text-center font-bold whitespace-nowrap">관리</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                    사용자 목록을 불러오는 중입니다.
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                    표시할 사용자가 없습니다.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-1.5 text-center text-[11px] text-slate-800 whitespace-nowrap">
                      {row.email}
                    </td>
                    <td className="px-3 py-1.5 text-center text-[11px] text-slate-700 whitespace-nowrap">
                      {row.name || '-'}
                    </td>
                    <td className="px-3 py-1.5 text-center whitespace-nowrap">
                      <select
                        value={row.role}
                        onChange={(e) => handleRoleChange(row.id, e.target.value)}
                        disabled={currentUserId === row.id}
                        className={`rounded-lg border px-2.5 py-0.5 text-center text-[11px] font-semibold outline-none disabled:bg-slate-100 disabled:text-slate-400 ${getRoleSelectClass(row.role)}`}
                      >
                        {ROLE_OPTIONS.map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-1.5 text-center text-[11px] text-slate-700 whitespace-nowrap">
                      {row.created_at
                        ? String(row.created_at).slice(0, 19).replace('T', ' ')
                        : '-'}
                    </td>
                    <td className="px-3 py-1.5 text-center text-[11px] text-slate-700 whitespace-nowrap">
                      {row.last_login
                        ? String(row.last_login).slice(0, 19).replace('T', ' ')
                        : '-'}
                    </td>
                    <td className="px-3 py-1.5 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleSaveRole(row)}
                          disabled={savingId === row.id || deletingId === row.id || currentUserId === row.id}
                          className="rounded-lg bg-slate-950 px-3 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
                        >
                          {savingId === row.id ? '저장 중...' : '저장'}
                        </button>
                        <button
                          onClick={() => handleDeleteUser(row)}
                          disabled={savingId === row.id || deletingId === row.id || currentUserId === row.id}
                          className="rounded-lg border border-rose-200 px-2.5 py-1 text-[11px] font-semibold text-rose-600 disabled:opacity-50"
                        >
                          {deletingId === row.id ? '삭제 중...' : '삭제'}
                        </button>
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
