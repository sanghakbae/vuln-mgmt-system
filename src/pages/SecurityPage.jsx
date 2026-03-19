import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { runSupabaseMutation } from '../utils/supabaseMutation';

const ADMIN_EMAIL_FALLBACKS = ['shbae@muhayu.com'];

function Card({ children, className = '' }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {children}
    </div>
  );
}

function Field({ label, children, hint }) {
  return (
    <label className="space-y-1.5">
      <div className="text-xs font-medium text-slate-800">{label}</div>
      {children}
      {hint ? <div className="text-xs text-slate-500">{hint}</div> : null}
    </label>
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

export default function SecurityPage() {
  const [roleLoading, setRoleLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [settingsRowId, setSettingsRowId] = useState(null);
  const [form, setForm] = useState({
    google_oauth_enabled: true,
    allowed_domains: 'muhayu.com,gmail.com',
    session_timeout_minutes: 60,
    updated_by: 'system',
    updated_at: '',
  });

  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    checkRole();
  }, []);

  useEffect(() => {
    if (isAdmin) {
      loadSettings();
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

  async function loadSettings() {
    try {
      setLoading(true);
      setError('');
      setMessage('');

      const { data, error } = await supabase
        .from('security_settings')
        .select('*')
        .order('id', { ascending: true })
        .limit(1);

      if (error) throw error;

      const row = data?.[0] || null;

      if (row) {
        setSettingsRowId(row.id);
        setForm({
          google_oauth_enabled: Boolean(row.google_oauth_enabled),
          allowed_domains: row.allowed_domains || 'muhayu.com,gmail.com',
          session_timeout_minutes: Number(row.session_timeout_minutes || 60),
          updated_by: row.updated_by || 'system',
          updated_at: row.updated_at || '',
        });
      } else {
        setSettingsRowId(null);
        setForm({
          google_oauth_enabled: true,
          allowed_domains: 'muhayu.com,gmail.com',
          session_timeout_minutes: 60,
          updated_by: 'system',
          updated_at: '',
        });
      }
    } catch (err) {
      console.error(err);
      setError(err.message || '보안 설정 조회 실패');
    } finally {
      setLoading(false);
    }
  }

  function handleChange(field, value) {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  async function insertSecurityAuditLog(action, detail) {
    try {
      const { data: authData } = await supabase.auth.getUser();
      const actorEmail = authData?.user?.email || 'unknown';

      await runSupabaseMutation(async () => {
        const { error } = await supabase.from('security_audit_logs').insert({
          actor_email: actorEmail,
          action,
          target_type: 'security_settings',
          target_id: settingsRowId ? String(settingsRowId) : null,
          detail,
        });

        if (error) throw error;
      });
    } catch (err) {
      console.error('security_audit_logs insert 실패:', err);
    }
  }

  async function handleSave() {
    try {
      setSaving(true);
      setError('');
      setMessage('');

      const { data: authData } = await supabase.auth.getUser();
      const actorEmail = authData?.user?.email || 'system';

      const payload = {
        google_oauth_enabled: Boolean(form.google_oauth_enabled),
        allowed_domains: String(form.allowed_domains || '')
          .split(',')
          .map((v) => v.trim().toLowerCase())
          .filter(Boolean)
          .join(','),
        session_timeout_minutes: Number(form.session_timeout_minutes || 60),
        updated_by: actorEmail,
        updated_at: new Date().toISOString(),
      };

      if (settingsRowId) {
        await runSupabaseMutation(async () => {
          const { error } = await supabase
            .from('security_settings')
            .update(payload)
            .eq('id', settingsRowId);

          if (error) throw error;
        });
      } else {
        const data = await runSupabaseMutation(async () => {
          const { data: insertedData, error } = await supabase
            .from('security_settings')
            .insert(payload)
            .select('id')
            .single();

          if (error) throw error;
          return insertedData;
        });
        setSettingsRowId(data?.id || null);
      }

      await insertSecurityAuditLog('update_security_settings', payload);

      setMessage('보안 설정이 저장되었습니다.');
      await loadSettings();
    } catch (err) {
      console.error(err);
      setError(err.message || '보안 설정 저장 실패');
    } finally {
      setSaving(false);
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
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="text-lg font-semibold text-slate-900">Admin Security</div>
          <div className="mt-1 text-xs text-slate-500">
            Google OAuth, 허용 도메인, 세션 타임아웃을 관리합니다.
          </div>
        </div>

        {(message || error) && (
          <div className="border-b border-slate-200 px-5 py-3">
            {message ? (
              <div className="text-xs text-emerald-600">{message}</div>
            ) : (
              <div className="text-xs text-rose-600">{error}</div>
            )}
          </div>
        )}

        {loading ? (
          <div className="px-5 py-10 text-center text-xs text-slate-400">
            보안 설정을 불러오는 중입니다.
          </div>
        ) : (
          <>
            <div className="grid gap-4 px-5 py-5 md:grid-cols-2">
              <Field
                label="Google OAuth 사용"
                hint="Google OAuth 로그인 허용 여부를 설정합니다."
              >
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      handleChange('google_oauth_enabled', !form.google_oauth_enabled)
                    }
                    className={`inline-flex h-[30px] min-w-[72px] items-center justify-center rounded-lg px-3 text-xs font-semibold ${
                      form.google_oauth_enabled
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {form.google_oauth_enabled ? '사용' : '중지'}
                  </button>
                </div>
              </Field>

              <Field
                label="세션 타임아웃 (분)"
                hint="로그인 후 세션 유지 시간입니다."
              >
                <input
                  type="number"
                  min={5}
                  max={1440}
                  value={form.session_timeout_minutes}
                  onChange={(e) => handleChange('session_timeout_minutes', e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs outline-none"
                />
              </Field>

              <div className="md:col-span-2">
                <Field
                  label="허용 도메인"
                  hint="쉼표(,)로 여러 도메인을 입력할 수 있습니다. 예: muhayu.com, gmail.com"
                >
                  <input
                    value={form.allowed_domains}
                    onChange={(e) => handleChange('allowed_domains', e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs outline-none"
                    placeholder="muhayu.com,gmail.com"
                  />
                </Field>
              </div>

              <Field label="최근 수정자">
                <input
                  value={form.updated_by || '-'}
                  readOnly
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs outline-none"
                />
              </Field>

              <Field label="최근 수정일">
                <input
                  value={
                    form.updated_at
                      ? String(form.updated_at).slice(0, 19).replace('T', ' ')
                      : '-'
                  }
                  readOnly
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs outline-none"
                />
              </Field>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button
                onClick={loadSettings}
                disabled={loading || saving}
                className="rounded-lg border border-slate-200 px-4 py-1.5 text-xs text-slate-600 disabled:opacity-50"
              >
                다시 불러오기
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-lg bg-slate-950 px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              >
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
