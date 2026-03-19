import { NAV_META, ADMIN_ONLY_MENUS } from './constants/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from './lib/supabase';
import { runSupabaseMutation } from './utils/supabaseMutation';
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

const ADMIN_EMAIL_FALLBACKS = ['shbae@muhayu.com'];
const ACTIVITY_EVENTS = [
  'mousemove',
  'mousedown',
  'keydown',
  'scroll',
  'touchstart',
  'click',
];
const ACTIVITY_THROTTLE_MS = 5000;
const WORKFLOW_CONFIRMATION_TABLE = 'workflow_confirmations';
const WORKFLOW_CONFIRMATION_TARGET_TYPE = 'workflow_confirmation';
const WORKFLOW_CONFIRMATION_STEPS = [
  'assets',
  'checklist',
  'inspection',
  'inspectionResult',
  'vuln',
];

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

export default function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeMenu, setActiveMenu] = useState('dashboard');
  const [currentUser, setCurrentUser] = useState(null);
  const [sessionTimeoutMinutes, setSessionTimeoutMinutes] = useState(60);
  const [assetsConfirmed, setAssetsConfirmed] = useState(false);
  const [checklistConfirmed, setChecklistConfirmed] = useState(false);
  const [inspectionConfirmed, setInspectionConfirmed] = useState(false);
  const [inspectionResultConfirmed, setInspectionResultConfirmed] = useState(false);
  const [vulnerabilityConfirmed, setVulnerabilityConfirmed] = useState(false);
  const [menuEnabledMap, setMenuEnabledMap] = useState({
    dashboard: true,
    assets: true,
    inspection: false,
    checklist: false,
    inspectionResult: false,
    vuln: false,
    report: false,
    security: true,
    access: true,
    audit: true,
  });

  const sessionTimerRef = useRef(null);
  const lastActivityAtRef = useRef(0);

  function applyWorkflowConfirmationState(nextState) {
    const normalized = {
      assets: Boolean(nextState.assets),
      checklist: Boolean(nextState.checklist),
      inspection: Boolean(nextState.inspection),
      inspectionResult: Boolean(nextState.inspectionResult),
      vuln: Boolean(nextState.vuln),
    };

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
    try {
      const { data, error } = await supabase
        .from(WORKFLOW_CONFIRMATION_TABLE)
        .select('step_key,is_confirmed')
        .in('step_key', WORKFLOW_CONFIRMATION_STEPS);

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
      applyWorkflowConfirmationState({
        assets: false,
        checklist: false,
        inspection: false,
        inspectionResult: false,
        vuln: false,
      });
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

    await runSupabaseMutation(async () => {
      const { error } = await supabase
        .from(WORKFLOW_CONFIRMATION_TABLE)
        .upsert(rows, { onConflict: 'step_key' });

      if (error) throw error;
    });

    await Promise.all(
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
        setAuthLoading(false);

        if (currentSession?.user?.email) {
          const email = currentSession.user.email;
          const fallbackRole = ADMIN_EMAIL_FALLBACKS.includes(email) ? 'admin' : 'user';

          setCurrentUser({
            id: currentSession.user.id,
            email,
            name:
              currentSession.user.user_metadata?.name ||
              currentSession.user.user_metadata?.full_name ||
              '',
            role: fallbackRole,
          });

          await validateAndSyncUser(currentSession);
        } else {
          setCurrentUser(null);
        }
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
        const fallbackRole = ADMIN_EMAIL_FALLBACKS.includes(email) ? 'admin' : 'user';

        setCurrentUser({
          id: newSession.user.id,
          email,
          name:
            newSession.user.user_metadata?.name ||
            newSession.user.user_metadata?.full_name ||
            '',
          role: fallbackRole,
        });

        await validateAndSyncUser(newSession);
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
        .select('*')
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

      if (!email) return;

      const securitySettings = await loadSecuritySettings();
      const googleOAuthEnabled = securitySettings?.google_oauth_enabled ?? true;

      const allowedDomains = String(
        securitySettings?.allowed_domains || 'muhayu.com'
      )
        .split(',')
        .map((v) => v.trim().toLowerCase())
        .filter(Boolean);

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

      const upsertTry1 = await runSupabaseMutation(async () => {
        return await supabase.from('users').upsert(
          {
            ...basePayload,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' }
        );
      });

      if (upsertTry1.error) {
        console.warn('users upsert(updated_at 포함) 실패:', upsertTry1.error.message);

        const upsertTry2 = await runSupabaseMutation(async () => {
          return await supabase
            .from('users')
            .upsert(basePayload, { onConflict: 'id' });
        });

        if (upsertTry2.error) {
          console.error('users fallback upsert 실패:', upsertTry2.error.message);
        }
      }

      const byId = await supabase
        .from('users')
        .select('*')
        .eq('id', currentSession.user.id)
        .maybeSingle();

      if (byId.error) {
        console.error('users 조회 실패(by id):', byId.error.message);
      }

      const dbUser = byId.data;

      if (dbUser) {
        setCurrentUser({
          ...dbUser,
          role:
            dbUser.role ||
            (ADMIN_EMAIL_FALLBACKS.includes(dbUser.email) ? 'admin' : 'user'),
        });
      }
    } catch (err) {
      console.error('validateAndSyncUser 실패:', err);
    }
  }

  function unlockNextStep(current) {
    setMenuEnabledMap((prev) => {
      const next = { ...prev };

      if (current === 'assets') next.checklist = true;
      if (current === 'checklist') next.inspection = true;
      if (current === 'inspection') next.inspectionResult = true;
      if (current === 'inspectionResult') next.vuln = true;
      if (current === 'vuln') next.report = true;

      return next;
    });
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
  const isAdmin =
    currentUser?.role === 'admin' || ADMIN_EMAIL_FALLBACKS.includes(effectiveEmail);

  useEffect(() => {
    if (!effectiveEmail) {
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
    if (menuEnabledMap[activeMenu] === false) return 'dashboard';
    if (!ADMIN_ONLY_MENUS.includes(activeMenu)) return activeMenu;
    return isAdmin ? activeMenu : 'dashboard';
  }, [activeMenu, isAdmin, menuEnabledMap]);

  const renderPage = () => {
    if (ADMIN_ONLY_MENUS.includes(safeActiveMenu) && !isAdmin) {
      return <NoPermission />;
    }

    switch (safeActiveMenu) {
      case 'dashboard':
        return <DashboardPage />;
      case 'assets':
        return (
          <AssetsPage
            unlockNextStep={unlockNextStep}
            assetsConfirmed={assetsConfirmed}
            onConfirmAssets={handleConfirmAssets}
            onCancelAssetConfirmation={handleCancelAssetConfirmation}
          />
        );
      case 'checklist':
        return (
          <ChecklistPage
            checklistConfirmed={checklistConfirmed}
            onConfirmChecklist={handleConfirmChecklist}
            onCancelChecklistConfirmation={handleCancelChecklistConfirmation}
          />
        );
      case 'inspection':
        return (
          <TargetRegistrationPage
            onNavigate={setActiveMenu}
            unlockNextStep={unlockNextStep}
            inspectionConfirmed={inspectionConfirmed}
            onConfirmInspectionTargets={handleConfirmInspectionTargets}
            onCancelInspectionConfirmation={handleCancelInspectionConfirmation}
          />
        );
      case 'inspectionResult':
        return (
          <InspectionPage
            unlockNextStep={unlockNextStep}
            inspectionResultConfirmed={inspectionResultConfirmed}
            onConfirmInspectionResults={handleConfirmInspectionResults}
            onCancelInspectionResultsConfirmation={handleCancelInspectionResultsConfirmation}
          />
        );
      case 'vuln':
        return (
          <VulnerabilitiesPage
            unlockNextStep={unlockNextStep}
            vulnerabilityConfirmed={vulnerabilityConfirmed}
            onConfirmVulnerabilities={handleConfirmVulnerabilities}
            onCancelVulnerabilitiesConfirmation={handleCancelVulnerabilitiesConfirmation}
          />
        );
      case 'report':
        return <ReportPage />;
      case 'security':
        return <SecurityPage />;
      case 'access':
        return <AccessControlPage />;
      case 'audit':
        return <AuditPage />;
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
    <AppLayout
      activeMenu={safeActiveMenu}
      setActiveMenu={setActiveMenu}
      title={NAV_META[safeActiveMenu]?.title || '취약점 관리 시스템'}
      desc={NAV_META[safeActiveMenu]?.desc || ''}
      currentUserRole={isAdmin ? 'admin' : currentUser?.role || 'user'}
      currentUserEmail={effectiveEmail}
      onLogout={handleLogout}
      menuEnabledMap={menuEnabledMap}
    >
      {renderPage()}
    </AppLayout>
  );
}
