import { useMemo, useState } from 'react';
import {
  LayoutDashboard,
  Server,
  Target,
  ClipboardCheck,
  FileSearch,
  FileText,
  Shield,
  History,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  X,
  Settings,
  Users,
  LogOut,
} from 'lucide-react';
import { NAV_ITEMS } from '../constants/navigation';
import { canAccessMenu, getRoleLabel } from '../utils/securityDefaults';

const menuIconMap = {
  dashboard: LayoutDashboard,
  assets: Server,
  inspection: Target,
  checklist: ClipboardCheck,
  inspectionResult: FileSearch,
  vuln: Shield,
  report: FileText,
  security: Settings,
  access: Users,
  audit: History,
};

const sidebarSections = [
  {
    key: 'overview',
    label: '개요',
    items: ['dashboard'],
  },
  {
    key: 'workflow',
    label: '점검 워크플로',
    items: ['assets', 'checklist', 'inspection', 'inspectionResult', 'vuln', 'report'],
  },
  {
    key: 'admin',
    label: '관리자 메뉴',
    items: ['security', 'access', 'audit'],
  },
];

function SidebarItem({ item, active, collapsed, onClick, disabled }) {
  const Icon = menuIconMap[item.key] || FileText;

  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={
        disabled
          ? '이전 단계 완료 후 활성화됩니다.'
          : collapsed
          ? item.label
          : undefined
      }
      className={`group relative flex w-full items-center transition-all ${
        collapsed
          ? 'justify-center rounded-2xl px-2 py-3.5'
          : 'gap-3 rounded-2xl px-4 py-3.5'
      } ${
        disabled
          ? 'cursor-not-allowed border border-transparent bg-slate-50 text-slate-300'
          : active
          ? 'border border-slate-200 bg-slate-900 text-white shadow-sm'
          : 'border border-transparent text-slate-700 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-950'
      }`}
    >
      {!collapsed && (
        <span
          className={`absolute left-1 top-1/2 h-8 w-1 -translate-y-1/2 rounded-full ${
            active ? 'bg-cyan-400' : 'bg-transparent'
          }`}
        />
      )}

      <span className="flex h-6 w-6 shrink-0 items-center justify-center">
        <Icon
          size={18}
          strokeWidth={2.2}
          className={`shrink-0 ${
            disabled
              ? 'text-slate-300'
              : active
              ? 'text-white'
              : 'text-slate-500 group-hover:text-slate-900'
          }`}
        />
      </span>

      {!collapsed && (
        <div className="min-w-0 text-left">
          <div className="truncate text-[13px] font-semibold leading-5 tracking-tight">
            {item.label}
          </div>
          <div
            className={`mt-0.5 truncate text-[11px] leading-4 ${
              disabled ? 'text-slate-300' : active ? 'text-slate-300' : 'text-slate-500'
            }`}
          >
            {item.desc}
          </div>
        </div>
      )}
    </button>
  );
}

function MobileBottomItem({ item, active, onClick, labelOverride, disabled }) {
  const Icon = menuIconMap[item.key] || FileText;

  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={labelOverride || item.label}
      className={`flex h-12 min-w-[36px] flex-1 items-center justify-center px-1 py-2 transition ${
        disabled
          ? 'cursor-not-allowed text-slate-300'
          : active
          ? 'text-slate-950'
          : 'text-slate-500'
      }`}
    >
      <Icon size={18} strokeWidth={2.1} />
    </button>
  );
}

export default function AppLayout({
  activeMenu,
  setActiveMenu,
  title,
  desc,
  children,
  currentUserRole,
  currentUserEmail,
  onLogout,
  menuEnabledMap = {},
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  const visibleMenu = useMemo(() => {
    return NAV_ITEMS.filter((item) =>
      canAccessMenu(item.key, currentUserEmail, currentUserRole)
    );
  }, [currentUserEmail, currentUserRole]);

  const activeMenuLabel = useMemo(() => {
    return visibleMenu.find((item) => item.key === activeMenu)?.label || title;
  }, [visibleMenu, activeMenu, title]);

  const visibleSections = useMemo(() => {
    return sidebarSections
      .map((section) => ({
        ...section,
        items: section.items
          .map((key) => visibleMenu.find((item) => item.key === key))
          .filter(Boolean),
      }))
      .filter((section) => section.items.length > 0);
  }, [visibleMenu]);

  function handleMenuChange(key) {
    if (menuEnabledMap[key] === false) return;
    setActiveMenu(key);
    setMobileDrawerOpen(false);
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white xl:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="min-w-0">
            <div className="truncate text-lg font-semibold text-slate-900">
              {title}
            </div>
            <div className="mt-0.5 truncate text-[11px] text-slate-500">
              {desc}
            </div>
          </div>

          <button
            onClick={() => setMobileDrawerOpen(true)}
            className="ml-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600"
            aria-label="모바일 메뉴 열기"
          >
            <Menu size={18} />
          </button>
        </div>
      </header>

      <div className="flex min-h-screen">
        <aside
          className={`hidden shrink-0 border-r border-slate-200 bg-white transition-[width] duration-300 xl:flex xl:flex-col ${
            collapsed ? 'w-20' : 'w-[300px]'
          }`}
        >
          <div
            className={`border-b border-slate-200 ${
              collapsed
                ? 'flex justify-center px-2 py-4'
                : 'flex items-center justify-between gap-3 px-5 py-4'
            }`}
          >
            {!collapsed ? (
              <>
                <div className="flex min-w-0 items-center gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-lg font-bold text-white">
                    V
                  </div>

                  <div className="min-w-0">
                    <div className="truncate text-[16px] font-bold leading-6 text-slate-900">
                      취약점 관리 시스템
                    </div>
                    <div className="mt-1 text-[12px] text-slate-400">
                      {getRoleLabel(currentUserRole, currentUserEmail)}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setCollapsed(true)}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
                  aria-label="메뉴 접기"
                >
                  <PanelLeftClose size={20} />
                </button>
              </>
            ) : (
              <button
                onClick={() => setCollapsed(false)}
                className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
                aria-label="메뉴 펼치기"
              >
                <PanelLeftOpen size={20} />
              </button>
            )}
          </div>

          <div className={`${collapsed ? 'px-2 py-4' : 'px-3 py-4'} flex-1 overflow-y-auto`}>
            <div className="space-y-5">
              {visibleSections.map((section) => (
                <div key={section.key}>
                  {!collapsed ? (
                    <div className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                      {section.label}
                    </div>
                  ) : null}

                  <div className="space-y-2">
                    {section.items.map((item) => (
                      <div key={item.key} className="relative">
                        <SidebarItem
                          item={item}
                          active={item.key === activeMenu}
                          collapsed={collapsed}
                          disabled={menuEnabledMap[item.key] === false}
                          onClick={() => setActiveMenu(item.key)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <header className="hidden bg-transparent xl:block">
            <div className="flex min-h-[72px] flex-col justify-center gap-1 px-6 py-3 lg:px-8 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0">
                <div className="truncate text-lg font-semibold text-slate-900">
                  {title}
                </div>
                <div className="mt-1 text-[12px] text-slate-500">{desc}</div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-[11px] text-slate-500 shadow-sm">
                  <span className="mr-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                    로그인
                  </span>
                  <span className="font-medium text-slate-800">
                    {currentUserEmail || '-'}
                  </span>
                </div>

                <div className="flex h-8 items-center rounded-lg border border-amber-200 bg-amber-50 px-3 text-[11px] font-semibold text-amber-700">
                  {getRoleLabel(currentUserRole, currentUserEmail)}
                </div>

                <button
                  onClick={onLogout}
                  className="inline-flex h-8 items-center gap-1 rounded-lg bg-slate-950 px-3 text-[11px] font-semibold text-white transition hover:bg-slate-800"
                >
                  <LogOut size={12} />
                  로그아웃
                </button>
              </div>
            </div>
          </header>

          <div className="space-y-4 px-4 py-4 pb-24 lg:px-6 lg:py-4 xl:px-6 xl:pb-0 2xl:px-8">
            {children}
          </div>
        </main>
      </div>

      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white xl:hidden">
        <div className="flex items-center gap-0.5 px-1">
          {visibleMenu.map((item) => (
            <MobileBottomItem
              key={item.key}
              item={item}
              active={item.key === activeMenu}
              disabled={menuEnabledMap[item.key] === false}
              onClick={() => handleMenuChange(item.key)}
              labelOverride={
                item.key === 'assets'
                  ? '자산'
                  : item.key === 'checklist'
                  ? '기준'
                  : item.key === 'inspection'
                  ? '대상'
                  : undefined
              }
            />
          ))}
        </div>
      </nav>

      {mobileDrawerOpen && (
        <div className="fixed inset-0 z-50 xl:hidden">
          <div
            className="absolute inset-0 bg-slate-950/40"
            onClick={() => setMobileDrawerOpen(false)}
          />

          <div className="absolute right-0 top-0 h-full w-[86%] max-w-[360px] bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4">
              <div className="min-w-0">
                <div className="truncate text-[16px] font-bold text-slate-900">
                  취약점 관리 시스템
                </div>
                <div className="mt-1 text-[12px] text-slate-400">
                  현재 메뉴: {activeMenuLabel}
                </div>
              </div>

              <button
                onClick={() => setMobileDrawerOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-600"
                aria-label="모바일 메뉴 닫기"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-3 py-4">
              <div className="space-y-2">
                {visibleMenu.map((item) => (
                  <SidebarItem
                    key={item.key}
                    item={item}
                    active={item.key === activeMenu}
                    collapsed={false}
                    disabled={menuEnabledMap[item.key] === false}
                    onClick={() => handleMenuChange(item.key)}
                  />
                ))}
              </div>
            </div>

            <div className="border-t border-slate-200 px-4 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-[11px] text-slate-500 shadow-sm">
                  {currentUserEmail || '-'}
                </div>

                <div className="flex h-8 items-center rounded-lg border border-amber-200 bg-amber-50 px-3 text-[11px] font-semibold text-amber-700">
                  {getRoleLabel(currentUserRole, currentUserEmail)}
                </div>

                <button
                  onClick={onLogout}
                  className="inline-flex h-8 items-center gap-1 rounded-lg bg-slate-950 px-3 text-[11px] font-semibold text-white transition hover:bg-slate-800"
                >
                  <LogOut size={12} />
                  로그아웃
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
