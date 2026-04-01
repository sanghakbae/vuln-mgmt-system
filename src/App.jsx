import { NAV_META } from './constants/navigation';
import React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from './lib/supabase';
import { runSupabaseMutation } from './utils/supabaseMutation';
import { buildErrorDetails } from './utils/errorDialog';
import { ASSET_SELECT_COLUMNS } from './services/assetsService';
import {
  canAccessMenu,
  canConfirmWorkflow,
  canDeleteReports,
  canEditWorkflowData,
  canGenerateReports,
  normalizeEmail,
  parseAllowedDomains,
  resolveUserRole,
} from './utils/securityDefaults';
import LoginPage from './pages/LoginPage';

import AppLayout from './layout/AppLayout';
import DashboardPage from './pages/DashboardPage';
import AssetsPage from './pages/AssetsPage';
import ChecklistPage from './pages/ChecklistPage';
import TargetRegistrationPage from './pages/TargetRegistrationPage';
import InspectionPage from './pages/InspectionPage';
import VulnerabilitiesPage from './pages/VulnerabilitiesPage';
import ReportPage from './pages/ReportPage';
import SecurityPage from './pages/SecurityPage';
import AuditPage from './pages/AuditPage';
import AccessControlPage from './pages/AccessControlPage';

const ACTIVITY_EVENTS = [
  'mousemove',
  'mousedown',
  'keydown',
  'scroll',
  'touchstart',
  'click',
];
const ACTIVITY_THROTTLE_MS = 5000;
const ASSETS_CACHE_KEY = 'assets-page-cache';
const WORKFLOW_CONFIRMATION_TABLE = 'workflow_confirmations';
const WORKFLOW_CONFIRMATION_TARGET_TYPE = 'workflow_confirmation';
const WORKFLOW_CONFIRMATION_STEPS = [
  'assets',
  'checklist',
  'inspection',
  'inspectionResult',
  'vuln',
];
const WORKFLOW_REQUEST_TIMEOUT_MS = 10000;
const USER_ROLE_CACHE_KEY = 'user-role-cache';
const WORKFLOW_CACHE_KEY = 'workflow-confirmation-cache';

function NoPermission() {
  return (
    <div className="rounded-xl border border-rose-200 bg-white p-8 text-center shadow-sm">
      <div className="text-lg font-semibold text-slate-900">접근 권한 없음</div>
      <div className="mt-2 text-sm text-slate-500">
        이 메뉴는 관리자만 접근할 수 있습니다.
      </div>
    </div>
  );
}

function withTimeout(task, timeoutMs, label) {
  return Promise.race([
    task,
    new Promise((_, reject) => {
      window.setTimeout(() => {
        reject(new Error(`${label} 처리 시간이 ${timeoutMs / 1000}초를 초과했습니다.`));
      }, timeoutMs);
    }),
  ]);
}

function readCachedUserRole(email) {
  if (typeof window === 'undefined') return '';

  try {
    const raw = window.sessionStorage.getItem(USER_ROLE_CACHE_KEY);
    if (!raw) return '';

    const parsed = JSON.parse(raw);
    return parsed?.[normalizeEmail(email)] || '';
  } catch {
    return '';
  }
}

function writeCachedUserRole(email, role) {
  if (typeof window === 'undefined') return;

  try {
    const raw = window.sessionStorage.getItem(USER_ROLE_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    parsed[normalizeEmail(email)] = role;
    window.sessionStorage.setItem(USER_ROLE_CACHE_KEY, JSON.stringify(parsed));
  } catch {
    // cache miss should not block auth flow
  }
}

function readCachedWorkflowState() {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.sessionStorage.getItem(WORKFLOW_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCachedWorkflowState(state) {
  if (typeof window === 'undefined') return;

  try {
    window.sessionStorage.setItem(WORKFLOW_CACHE_KEY, JSON.stringify(state));
  } catch {
    // cache write failure should not block rendering
  }
}

function ErrorDialog({ detail, onClose }) {
  if (!detail) return null;

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-950/60 px-4">
      <div className="w-full max-w-3xl overflow-hidden rounded-2xl border border-rose-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <div className="text-lg font-semibold text-slate-900">{detail.title}</div>
            <div className="mt-1 text-xs text-slate-500">{detail.summary}</div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700"
          >
            닫기
          </button>
        </div>

        <div className="space-y-3 px-5 py-4">
          <div className="text-xs font-medium text-slate-500">상세 오류 정보</div>
          <textarea
            readOnly
            value={detail.detailsText}
            rows={18}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-[12px] leading-5 text-slate-800 outline-none"
          />
        </div>
      </div>
    </div>
  );
}

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { errorDetail: null };
  }

  static getDerivedStateFromError(error) {
    return {
      errorDetail: buildErrorDetails(error, {
        title: '화면 렌더링 오류',
        context: 'AppErrorBoundary',
      }),
    };
  }

  componentDidCatch(error) {
    console.error('render error', error);
  }

  render() {
    if (this.state.errorDetail) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
          <div className="w-full max-w-3xl rounded-2xl border border-rose-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <div className="text-lg font-semibold text-slate-900">화면 렌더링 오류</div>
              <div className="mt-1 text-xs text-slate-500">
                아래 상세 정보를 확인하세요.
              </div>
            </div>
            <div className="px-5 py-4">
              <textarea
                readOnly
                value={this.state.errorDetail.detailsText}
                rows={18}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-[12px] leading-5 text-slate-800 outline-none"
              />
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [workflowLoading, setWorkflowLoading] = useState(false);
  const [activeMenu, setActiveMenu] = useState('dashboard');
  const [currentUser, setCurrentUser] = useState(null);
  const [sessionTimeoutMinutes, setSessionTimeoutMinutes] = useState(60);
  const [assetsConfirmed, setAssetsConfirmed] = useState(false);
  const [checklistConfirmed, setChecklistConfirmed] = useState(false);
  const [inspectionConfirmed, setInspectionConfirmed] = useState(false);
  const [inspectionResultConfirmed, setInspectionResultConfirmed] = useState(false);
  const [vulnerabilityConfirmed, setVulnerabilityConfirmed] = useState(false);
  const [errorDialog, setErrorDialog] = useState(null);
  const [menuEnabledMap, setMenuEnabledMap] = useState(() => {
    const cached = readCachedWorkflowState();
    const normalized = {
      assets: cached?.assets === true,
      checklist: cached?.checklist === true,
      inspection: cached?.inspection === true,
      inspectionResult: cached?.inspectionResult === true,
      vuln: cached?.vuln === true,
    };

    return {
      dashboard: true,
      assets: true,
      checklist: normalized.assets,
      inspection: normalized.checklist,
      inspectionResult: normalized.inspection,
      vuln: normalized.inspectionResult,
      report: normalized.vuln,
      security: true,
      access: true,
      audit: true,
    };
  });

  const sessionTimerRef = useRef(null);
  const lastActivityAtRef = useRef(0);

  useEffect(() => {
    function handleAppError(event) {
      setErrorDialog(event.detail || null);
    }

    function handleWindowError(event) {
      setErrorDialog(
        buildErrorDetails(event.error || event.message || '런타임 오류', {
          title: '런타임 오류',
          context: 'window.error',
        })
      );
    }

    function handleUnhandledRejection(event) {
      setErrorDialog(
        buildErrorDetails(event.reason || '처리되지 않은 비동기 오류', {
          title: '처리되지 않은 비동기 오류',
          context: 'window.unhandledrejection',
        })
      );
    }

    window.addEventListener('app:error', handleAppError);
    window.addEventListener('error', handleWindowError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('app:error', handleAppError);
      window.removeEventListener('error', handleWindowError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  async function warmAssetsCache() {
    try {
      const attempts = [
        () => supabase.from('assets').select(ASSET_SELECT_COLUMNS).order('updated_at', { ascending: false }),
        () => supabase.from('assets').select(ASSET_SELECT_COLUMNS).order('asset_code', { ascending: true }),
        () => supabase.from('assets').select(ASSET_SELECT_COLUMNS),
      ];

      let lastError = null;

      for (const run of attempts) {
        const { data, error } = await run();
        if (error) {
          lastError = error;
          continue;
        }

        if (typeof window !== 'undefined') {
          window.localStorage.setItem(
            ASSETS_CACHE_KEY,
            JSON.stringify({
              rows: data || [],
              rawCount: data?.length || 0,
              updatedAt: Date.now(),
            })
          );
        }

        return;
      }

      if (lastError) {
        console.error('assets cache warmup 실패:', lastError);
      }
    } catch (err) {
      console.error('assets cache warmup 예외:', err);
    }
  }

  if (!supabase) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6 text-center">
        <div className="rounded-xl border border-rose-200 bg-white p-8 shadow-sm">
          <div className="text-lg font-semibold text-slate-900">Supabase 설정 누락</div>
          <div className="mt-2 text-sm text-slate-500">
            `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`가 배포 환경에 설정되어야 합니다.
          </div>
        </div>
      </div>
    );
  }

  function applyWorkflowConfirmationState(nextState) {
    const normalized = {
      assets: Boolean(nextState.assets),
      checklist: Boolean(nextState.checklist),
      inspection: Boolean(nextState.inspection),
      inspectionResult: Boolean(nextState.inspectionResult),
      vuln: Boolean(nextState.vuln),
    };

    writeCachedWorkflowState(normalized);

    setAssetsConfirmed(normalized.assets);
    setChecklistConfirmed(normalized.checklist);
    setInspectionConfirmed(normalized.inspection);
    setInspectionResultConfirmed(normalized.inspectionResult);
    setVulnerabilityConfirmed(normalized.vuln);
    setMenuEnabledMap((prev) => ({
      ...prev,
      checklist: normalized.assets,
      inspection: normalized.checklist,
      inspectionResult: normalized.inspection,
      vuln: normalized.inspectionResult,
      report: normalized.vuln,
    }));
  }

  function getCurrentWorkflowConfirmationState() {
    return {
      assets: assetsConfirmed,
      checklist: checklistConfirmed,
      inspection: inspectionConfirmed,
      inspectionResult: inspectionResultConfirmed,
      vuln: vulnerabilityConfirmed,
    };
  }

  async function loadWorkflowConfirmations() {
    setWorkflowLoading(true);

    try {
      const { data, error } = await withTimeout(
        supabase
          .from(WORKFLOW_CONFIRMATION_TABLE)
          .select('step_key,is_confirmed')
          .in('step_key', WORKFLOW_CONFIRMATION_STEPS),
        WORKFLOW_REQUEST_TIMEOUT_MS,
        '워크플로 상태 조회'
      );

      if (error) throw error;
      const rowMap = Object.fromEntries((data || []).map((row) => [row.step_key, row]));

      applyWorkflowConfirmationState({
        assets: rowMap.assets?.is_confirmed === true,
        checklist: rowMap.checklist?.is_confirmed === true,
        inspection: rowMap.inspection?.is_confirmed === true,
        inspectionResult: rowMap.inspectionResult?.is_confirmed === true,
        vuln: rowMap.vuln?.is_confirmed === true,
      });
    } catch (err) {
      console.error('workflow confirmation 로드 실패:', err);
      setErrorDialog(
        buildErrorDetails(err, {
          title: '워크플로 상태 조회 실패',
          context: 'App.loadWorkflowConfirmations',
        })
      );
      applyWorkflowConfirmationState({
        assets: false,
        checklist: false,
        inspection: false,
        inspectionResult: false,
        vuln: false,
      });
    } finally {
      setWorkflowLoading(false);
    }
  }

  async function persistWorkflowConfirmationChanges(changes) {
    if (!effectiveEmail) return;

    const actorId = currentUser?.id || session?.user?.id || null;
    const now = new Date().toISOString();
    const rows = Object.entries(changes).map(([step, confirmed]) => {
      const isConfirmed = Boolean(confirmed);

      return {
        step_key: step,
        is_confirmed: isConfirmed,
        confirmed_by_email: isConfirmed ? effectiveEmail : null,
        confirmed_by_user_id: isConfirmed ? actorId : null,
        confirmed_at: isConfirmed ? now : null,
        last_changed_by_email: effectiveEmail,
        last_changed_by_user_id: actorId,
        updated_at: now,
      };
    });

    await withTimeout(
      runSupabaseMutation(async () => {
        const { error } = await supabase
          .from(WORKFLOW_CONFIRMATION_TABLE)
          .upsert(rows, { onConflict: 'step_key' });

        if (error) throw error;
      }),
      WORKFLOW_REQUEST_TIMEOUT_MS,
      '워크플로 확정 저장'
    );

    await withTimeout(
      Promise.all(
        Object.entries(changes).map(([step, confirmed]) =>
          insertSecurityAuditLog(
            confirmed ? 'confirm' : 'cancel',
            {
              step,
              confirmed: Boolean(confirmed),
            },
            effectiveEmail,
            actorId,
            WORKFLOW_CONFIRMATION_TARGET_TYPE
          )
        )
      ),
      WORKFLOW_REQUEST_TIMEOUT_MS,
      '감사 로그 저장'
    );
  }

  useEffect(() => {
    let mounted = true;

    async function bootstrap() {
      try {
        const { data, error } = await supabase.auth.getSession();

        if (error) {
          console.error('getSession 실패:', error.message);
        }

        if (!mounted) return;

        const currentSession = data?.session ?? null;
        setSession(currentSession);

        if (currentSession?.user?.email) {
          const email = currentSession.user.email;
          const cachedRole = readCachedUserRole(email);
          setCurrentUser({
            id: currentSession.user.id,
            email,
            name:
              currentSession.user.user_metadata?.name ||
              currentSession.user.user_metadata?.full_name ||
              '',
            role: resolveUserRole(cachedRole, email),
          });

          await validateAndSyncUser(currentSession);
          warmAssetsCache().catch((err) => {
            console.error('assets cache warmup 실패:', err);
          });
        } else {
          setCurrentUser(null);
        }
        setAuthLoading(false);
      } catch (err) {
        console.error('앱 초기화 실패:', err);
        if (mounted) {
          setAuthLoading(false);
        }
      }
    }

    bootstrap();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      if (!mounted) return;

      setSession(newSession ?? null);
      setAuthLoading(false);

      if (newSession?.user?.email) {
        const email = newSession.user.email;
        const cachedRole = readCachedUserRole(email);
        setCurrentUser({
          id: newSession.user.id,
          email,
          name:
            newSession.user.user_metadata?.name ||
            newSession.user.user_metadata?.full_name ||
            '',
          role: resolveUserRole(cachedRole, email),
        });

        await validateAndSyncUser(newSession);
        warmAssetsCache().catch((err) => {
          console.error('assets cache warmup 실패:', err);
        });
      } else {
        setCurrentUser(null);
        clearSessionTimer();
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
      clearSessionTimer();
    };
  }, []);

  useEffect(() => {
    if (!session) {
      clearSessionTimer();
      return undefined;
    }

    startSessionTimer(sessionTimeoutMinutes);

    function handleUserActivity() {
      const now = Date.now();

      if (now - lastActivityAtRef.current < ACTIVITY_THROTTLE_MS) {
        return;
      }

      lastActivityAtRef.current = now;
      startSessionTimer(sessionTimeoutMinutes);
    }

    ACTIVITY_EVENTS.forEach((eventName) => {
      window.addEventListener(eventName, handleUserActivity, { passive: true });
    });

    return () => {
      clearSessionTimer();
      ACTIVITY_EVENTS.forEach((eventName) => {
        window.removeEventListener(eventName, handleUserActivity);
      });
    };
  }, [session, sessionTimeoutMinutes]);

  function clearSessionTimer() {
    if (sessionTimerRef.current) {
      clearTimeout(sessionTimerRef.current);
      sessionTimerRef.current = null;
    }
  }

  function startSessionTimer(timeoutMinutes) {
    clearSessionTimer();

    const safeMinutes = Number(timeoutMinutes) > 0 ? Number(timeoutMinutes) : 60;

    sessionTimerRef.current = setTimeout(async () => {
      try {
        await insertSecurityAuditLog('session_timeout_logout', {
          reason: 'idle_timeout',
          timeout_minutes: safeMinutes,
        });
      } catch (err) {
        console.error('세션 만료 audit 로그 실패:', err);
      }

      alert('세션이 만료되었습니다.');
      await supabase.auth.signOut({ scope: 'global' });
      setSession(null);
      setCurrentUser(null);
      setActiveMenu('dashboard');
      window.location.reload();
    }, safeMinutes * 60 * 1000);
  }

  async function loadSecuritySettings() {
    try {
      const { data: securityRows, error } = await supabase
        .from('security_settings')
        .select('google_oauth_enabled,allowed_domains,session_timeout_minutes')
        .order('id', { ascending: true })
        .limit(1);

      if (error) {
        console.error('security_settings 조회 실패:', error.message);
        return null;
      }

      return securityRows?.[0] || null;
    } catch (err) {
      console.error('security_settings 로드 실패:', err);
      return null;
    }
  }

  async function insertSecurityAuditLog(
    action,
    detail = {},
    overrideEmail = null,
    overrideUserId = null,
    overrideTargetType = 'auth'
  ) {
    try {
      const actorEmail =
        overrideEmail ||
        currentUser?.email ||
        session?.user?.email ||
        'unknown';

      const targetId =
        overrideUserId ||
        currentUser?.id ||
        session?.user?.id ||
        null;

      await runSupabaseMutation(async () => {
        const { error } = await supabase.from('security_audit_logs').insert({
          actor_email: actorEmail,
          action,
          target_type: overrideTargetType,
          target_id: targetId ? String(targetId) : null,
          detail,
        });

        if (error) throw error;
      });
    } catch (err) {
      console.error('security_audit_logs insert 예외:', err);
    }
  }

  async function validateAndSyncUser(currentSession) {
    try {
      const email = currentSession?.user?.email || '';
      const domain = email.split('@')[1]?.toLowerCase() || '';
      const defaultRole = resolveUserRole('', email);

      if (!email) return;

      const securitySettings = await loadSecuritySettings();
      const googleOAuthEnabled = securitySettings?.google_oauth_enabled ?? true;

      const allowedDomains = parseAllowedDomains(securitySettings?.allowed_domains);

      const timeoutMinutes = Number(securitySettings?.session_timeout_minutes || 60);
      setSessionTimeoutMinutes(timeoutMinutes);

      if (!googleOAuthEnabled || !allowedDomains.includes(domain)) {
        alert('허용되지 않은 계정입니다.');
        await supabase.auth.signOut({ scope: 'global' });
        setCurrentUser(null);
        return;
      }

      const basePayload = {
        id: currentSession.user.id,
        email: currentSession.user.email,
        name:
          currentSession.user.user_metadata?.name ||
          currentSession.user.user_metadata?.full_name ||
          '',
        last_login: new Date().toISOString(),
      };

      const existingUser = await supabase
        .from('users')
        .select('id,role')
        .eq('id', currentSession.user.id)
        .maybeSingle();

      if (existingUser.error) {
        console.error('users 조회 실패(기존 사용자 확인):', existingUser.error.message);
      }

      const upsertPayload = existingUser.data
        ? {
            ...basePayload,
            updated_at: new Date().toISOString(),
          }
        : {
            ...basePayload,
            role: defaultRole,
            updated_at: new Date().toISOString(),
          };

      const upsertTry1 = await runSupabaseMutation(async () => {
        return await supabase.from('users').upsert(upsertPayload, { onConflict: 'id' });
      });

      if (upsertTry1.error) {
        console.warn('users upsert(updated_at 포함) 실패:', upsertTry1.error.message);

        const upsertTry2 = await runSupabaseMutation(async () => {
          return await supabase.from('users').upsert(
            existingUser.data
              ? basePayload
              : {
                  ...basePayload,
                  role: defaultRole,
                },
            { onConflict: 'id' }
          );
        });

        if (upsertTry2.error) {
          console.error('users fallback upsert 실패:', upsertTry2.error.message);
        }
      }

      const byId = await supabase
        .from('users')
        .select('id,email,name,role')
        .eq('id', currentSession.user.id)
        .maybeSingle();

      if (byId.error) {
        console.error('users 조회 실패(by id):', byId.error.message);
      }

      const dbUser = byId.data;

      if (dbUser) {
        const resolvedRole = resolveUserRole(dbUser.role, dbUser.email);

        if (!dbUser.role) {
          const { error: roleUpdateError } = await supabase
            .from('users')
            .update({
              role: resolvedRole,
              updated_at: new Date().toISOString(),
            })
            .eq('id', dbUser.id);

          if (roleUpdateError) {
            console.warn('users role 기본값 저장 실패:', roleUpdateError.message);
          } else {
            dbUser.role = resolvedRole;
          }
        }

        writeCachedUserRole(dbUser.email, resolvedRole);
        setCurrentUser({
          ...dbUser,
          role: resolvedRole,
        });
      }
    } catch (err) {
      console.error('validateAndSyncUser 실패:', err);
    }
  }

  const handleLogout = async () => {
    await insertSecurityAuditLog('logout', {
      reason: 'manual_logout',
    });

    await supabase.auth.signOut({ scope: 'global' });
    setSession(null);
    setCurrentUser(null);
    setActiveMenu('dashboard');
    clearSessionTimer();
  };

  const effectiveEmail = currentUser?.email || session?.user?.email || '';
  const effectiveRole = resolveUserRole(currentUser?.role, effectiveEmail);
  const isAdmin = effectiveRole === 'admin';
  const canEditData = canEditWorkflowData(effectiveEmail, effectiveRole);
  const canConfirmData = canConfirmWorkflow(effectiveEmail, effectiveRole);
  const canGenerateReport = canGenerateReports(effectiveEmail, effectiveRole);
  const canDeleteReport = canDeleteReports(effectiveEmail, effectiveRole);
  const effectiveMenuEnabledMap = useMemo(
    () =>
      isAdmin
        ? Object.keys(menuEnabledMap).reduce((acc, key) => ({ ...acc, [key]: true }), {})
        : menuEnabledMap,
    [isAdmin, menuEnabledMap]
  );

  useEffect(() => {
    if (!effectiveEmail) {
      setWorkflowLoading(false);
      applyWorkflowConfirmationState({
        assets: false,
        checklist: false,
        inspection: false,
        inspectionResult: false,
        vuln: false,
      });
      return;
    }

    loadWorkflowConfirmations();
  }, [effectiveEmail]);

  async function handleConfirmAssets() {
    if (!effectiveEmail) return;

    await persistWorkflowConfirmationChanges({ assets: true });
    applyWorkflowConfirmationState({
      ...getCurrentWorkflowConfirmationState(),
      assets: true,
    });
  }

  async function handleConfirmChecklist() {
    if (!effectiveEmail) return;

    await persistWorkflowConfirmationChanges({ checklist: true });
    applyWorkflowConfirmationState({
      ...getCurrentWorkflowConfirmationState(),
      checklist: true,
    });
  }

  async function handleCancelAssetConfirmation() {
    if (!effectiveEmail) return;

    await persistWorkflowConfirmationChanges({
      assets: false,
      checklist: false,
      inspection: false,
      inspectionResult: false,
      vuln: false,
    });
    applyWorkflowConfirmationState({
      assets: false,
      checklist: false,
      inspection: false,
      inspectionResult: false,
      vuln: false,
    });

    if (['checklist', 'inspection', 'inspectionResult', 'vuln', 'report'].includes(activeMenu)) {
      setActiveMenu('assets');
    }
  }

  async function handleCancelChecklistConfirmation() {
    if (!effectiveEmail) return;

    await persistWorkflowConfirmationChanges({
      checklist: false,
      inspection: false,
      inspectionResult: false,
      vuln: false,
    });
    applyWorkflowConfirmationState({
      ...getCurrentWorkflowConfirmationState(),
      checklist: false,
      inspection: false,
      inspectionResult: false,
      vuln: false,
    });

    if (['inspection', 'inspectionResult', 'vuln', 'report'].includes(activeMenu)) {
      setActiveMenu('checklist');
    }
  }

  async function handleConfirmInspectionTargets() {
    if (!effectiveEmail) return;

    await persistWorkflowConfirmationChanges({ inspection: true });
    applyWorkflowConfirmationState({
      ...getCurrentWorkflowConfirmationState(),
      inspection: true,
    });
  }

  async function handleCancelInspectionConfirmation() {
    if (!effectiveEmail) return;

    await persistWorkflowConfirmationChanges({
      inspection: false,
      inspectionResult: false,
      vuln: false,
    });
    applyWorkflowConfirmationState({
      ...getCurrentWorkflowConfirmationState(),
      inspection: false,
      inspectionResult: false,
      vuln: false,
    });

    if (['inspectionResult', 'vuln', 'report'].includes(activeMenu)) {
      setActiveMenu('inspection');
    }
  }

  async function handleConfirmInspectionResults() {
    if (!effectiveEmail) return;

    await persistWorkflowConfirmationChanges({ inspectionResult: true });
    applyWorkflowConfirmationState({
      ...getCurrentWorkflowConfirmationState(),
      inspectionResult: true,
    });
  }

  async function handleCancelInspectionResultsConfirmation() {
    if (!effectiveEmail) return;

    await persistWorkflowConfirmationChanges({
      inspectionResult: false,
      vuln: false,
    });
    applyWorkflowConfirmationState({
      ...getCurrentWorkflowConfirmationState(),
      inspectionResult: false,
      vuln: false,
    });

    if (['vuln', 'report'].includes(activeMenu)) {
      setActiveMenu('inspectionResult');
    }
  }

  async function handleConfirmVulnerabilities() {
    if (!effectiveEmail) return;

    await persistWorkflowConfirmationChanges({ vuln: true });
    applyWorkflowConfirmationState({
      ...getCurrentWorkflowConfirmationState(),
      vuln: true,
    });
  }

  async function handleCancelVulnerabilitiesConfirmation() {
    if (!effectiveEmail) return;

    await persistWorkflowConfirmationChanges({ vuln: false });
    applyWorkflowConfirmationState({
      ...getCurrentWorkflowConfirmationState(),
      vuln: false,
    });

    if (activeMenu === 'report') {
      setActiveMenu('vuln');
    }
  }

  const safeActiveMenu = useMemo(() => {
    if (effectiveMenuEnabledMap[activeMenu] === false) return 'dashboard';
    return canAccessMenu(activeMenu, effectiveEmail, effectiveRole) ? activeMenu : 'dashboard';
  }, [activeMenu, effectiveEmail, effectiveRole, effectiveMenuEnabledMap]);

  const renderPage = () => {
    if (!canAccessMenu(safeActiveMenu, effectiveEmail, effectiveRole)) {
      return <NoPermission />;
    }

    switch (safeActiveMenu) {
      case 'dashboard':
        return <DashboardPage />;
      case 'assets':
        return (
          <AssetsPage
            assetsConfirmed={assetsConfirmed}
            canEdit={canEditData}
            canConfirm={canConfirmData}
            onConfirmAssets={handleConfirmAssets}
            onCancelAssetConfirmation={handleCancelAssetConfirmation}
          />
        );
      case 'checklist':
        return (
          <ChecklistPage
            checklistConfirmed={checklistConfirmed}
            canEdit={canEditData}
            canConfirm={canConfirmData}
            onConfirmChecklist={handleConfirmChecklist}
            onCancelChecklistConfirmation={handleCancelChecklistConfirmation}
          />
        );
      case 'inspection':
        return (
          <TargetRegistrationPage
            onNavigate={setActiveMenu}
            inspectionConfirmed={inspectionConfirmed}
            canEdit={canEditData}
            canConfirm={canConfirmData}
            onConfirmInspectionTargets={handleConfirmInspectionTargets}
            onCancelInspectionConfirmation={handleCancelInspectionConfirmation}
          />
        );
      case 'inspectionResult':
        return (
          <InspectionPage
            inspectionResultConfirmed={inspectionResultConfirmed}
            canEdit={canEditData}
            canConfirm={canConfirmData}
            onConfirmInspectionResults={handleConfirmInspectionResults}
            onCancelInspectionResultsConfirmation={handleCancelInspectionResultsConfirmation}
          />
        );
      case 'vuln':
        return (
          <VulnerabilitiesPage
            vulnerabilityConfirmed={vulnerabilityConfirmed}
            canEdit={canEditData}
            canConfirm={canConfirmData}
            onConfirmVulnerabilities={handleConfirmVulnerabilities}
            onCancelVulnerabilitiesConfirmation={handleCancelVulnerabilitiesConfirmation}
          />
        );
      case 'report':
        return (
          <ReportPage
            canGenerate={canGenerateReport}
            canDelete={canDeleteReport}
          />
        );
      case 'security':
        return (
          <SecurityPage
            currentUserEmail={effectiveEmail}
            currentUserRole={effectiveRole}
          />
        );
      case 'access':
        return (
          <AccessControlPage
            currentUserEmail={effectiveEmail}
            currentUserRole={effectiveRole}
            currentUserId={currentUser?.id || session?.user?.id || null}
          />
        );
      case 'audit':
        return (
          <AuditPage
            currentUserEmail={effectiveEmail}
            currentUserRole={effectiveRole}
          />
        );
      default:
        return <DashboardPage />;
    }
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">
        로그인 상태 확인 중...
      </div>
    );
  }

  if (!session) {
    return <LoginPage />;
  }

  return (
    <>
      <AppErrorBoundary>
        <AppLayout
          activeMenu={safeActiveMenu}
          setActiveMenu={setActiveMenu}
          title={NAV_META[safeActiveMenu]?.title || '취약점 관리 시스템'}
          desc={NAV_META[safeActiveMenu]?.desc || ''}
          currentUserRole={effectiveRole}
          currentUserEmail={effectiveEmail}
          onLogout={handleLogout}
          menuEnabledMap={effectiveMenuEnabledMap}
        >
          {renderPage()}
        </AppLayout>
      </AppErrorBoundary>

      <ErrorDialog detail={errorDialog} onClose={() => setErrorDialog(null)} />
    </>
  );
}
