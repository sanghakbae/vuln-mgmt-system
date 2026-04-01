import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  ClipboardList,
  FileText,
  Layers3,
  PieChart,
  Target,
  Wrench,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

const DASHBOARD_SUMMARY_CACHE_KEY = 'dashboard-summary-cache';
const DASHBOARD_SNAPSHOT_CACHE_KEY = 'dashboard-snapshot-cache';

function Card({ children, className = '' }) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {children}
    </div>
  );
}

function SectionTitle({ icon: Icon, title, desc }) {
  return (
    <div className="flex items-start gap-3 border-b border-slate-100 px-4 py-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
        <Icon size={18} />
      </div>
      <div>
        <div className="text-sm font-semibold text-slate-900">{title}</div>
        {desc ? <div className="mt-0.5 text-[11px] text-slate-500">{desc}</div> : null}
      </div>
    </div>
  );
}

function KpiCard({ title, value, sub, icon: Icon, tone }) {
  const toneMap = {
    blue: 'from-sky-500 to-cyan-400 text-white',
    rose: 'from-rose-500 to-pink-400 text-white',
    emerald: 'from-emerald-500 to-teal-400 text-white',
    violet: 'from-violet-500 to-fuchsia-400 text-white',
  };

  return (
    <div
      className={`flex min-h-[112px] flex-col justify-between rounded-xl bg-gradient-to-br ${toneMap[tone]} p-2.5 xl:rounded-2xl xl:p-3 2xl:p-4 shadow-sm`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] xl:text-[10px] 2xl:text-xs font-medium leading-4 text-white/85">{title}</div>
          <div className="mt-1 text-[18px] xl:text-[18px] 2xl:text-[28px] font-bold tracking-tight">{value}</div>
          <div className="mt-0.5 text-[9px] xl:text-[9px] 2xl:text-[11px] leading-3.5 text-white/80">{sub}</div>
        </div>
        <div className="flex h-7 w-7 xl:h-8 xl:w-8 2xl:h-10 2xl:w-10 items-center justify-center rounded-xl xl:rounded-2xl bg-white/20">
          <Icon size={14} />
        </div>
      </div>
    </div>
  );
}

function ProgressRow({ label, value, total, tone }) {
  const percent = total > 0 ? Math.round((value / total) * 100) : 0;

  const barTone = {
    blue: 'bg-sky-500',
    emerald: 'bg-emerald-500',
    amber: 'bg-amber-400',
    rose: 'bg-rose-500',
    violet: 'bg-violet-500',
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3 text-xs">
        <div className="font-medium text-slate-700">{label}</div>
        <div className="text-slate-500">
          {value}건 · {percent}%
        </div>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full ${barTone[tone] || 'bg-slate-700'}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function DistributionRow({ label, value, total, colorClass }) {
  const percent = total > 0 ? Math.round((value / total) * 100) : 0;

  return (
    <div className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2">
      <div className={`h-3 w-3 rounded-full ${colorClass}`} />
      <div className="min-w-0 flex-1 text-xs font-medium text-slate-700">{label}</div>
      <div className="text-xs font-semibold text-slate-900">{value}</div>
      <div className="w-10 text-right text-xs text-slate-500">{percent}%</div>
    </div>
  );
}

function StatusBadge({ children, tone = 'slate' }) {
  const toneMap = {
    emerald: 'bg-emerald-100 text-emerald-700',
    rose: 'bg-rose-100 text-rose-700',
    amber: 'bg-amber-100 text-amber-700',
    blue: 'bg-sky-100 text-sky-700',
    violet: 'bg-violet-100 text-violet-700',
    slate: 'bg-slate-100 text-slate-700',
  };

  return (
    <span className={`inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-semibold leading-4 ${toneMap[tone]}`}>
      {children}
    </span>
  );
}

function SimpleTable({ rows, columns, emptyText = '표시할 데이터가 없습니다.' }) {
  return (
    <div className="w-full">
      <table className="w-full table-fixed text-[11px] sm:text-xs">
        <thead className="bg-slate-50 text-slate-500">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className={`px-2 py-2 font-semibold sm:px-3 ${
                  col.align === 'right'
                    ? 'text-right'
                    : col.align === 'left'
                    ? 'text-left'
                    : 'text-center'
                } break-words`}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-2 py-6 text-center text-[11px] text-slate-400 sm:px-3 sm:text-xs">
                {emptyText}
              </td>
            </tr>
          ) : (
            rows.map((row, idx) => (
              <tr key={idx} className="border-t border-slate-100">
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-2 py-2 text-[11px] text-slate-700 sm:px-3 sm:text-xs ${
                      col.align === 'right'
                        ? 'text-right'
                        : col.align === 'left'
                        ? 'text-left'
                        : 'text-center'
                    } break-words align-top`}
                  >
                    {row[col.key]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

const TYPE_LABEL_MAP = {
  SERVER: '서버시스템',
  DATABASE: '데이터베이스',
  WEB_APP: '웹애플리케이션',
  WAS: 'WAS',
  NETWORK: '네트워크장비',
  SECURITY: '보안솔루션',
  ETC: '기타',
};

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summary, setSummary] = useState({
    totalAssets: 0,
    checklistCount: 0,
    targetCount: 0,
    vulnerableCount: 0,
    completedCount: 0,
    reportCount: 0,
  });
  const [progressData, setProgressData] = useState([]);
  const [assetDistribution, setAssetDistribution] = useState([]);
  const [recentInspections, setRecentInspections] = useState([]);
  const [recentActions, setRecentActions] = useState([]);
  const [recentReports, setRecentReports] = useState([]);
  const [riskDistribution, setRiskDistribution] = useState({ high: 0, medium: 0, low: 0 });
  const [error, setError] = useState('');

  useEffect(() => {
    try {
      const cachedSnapshot = window.sessionStorage.getItem(DASHBOARD_SNAPSHOT_CACHE_KEY);
      if (cachedSnapshot) {
        const parsed = JSON.parse(cachedSnapshot);

        if (parsed?.summary) {
          setSummary(parsed.summary);
          setSummaryLoading(false);
        }

        if (Array.isArray(parsed?.progressData)) {
          setProgressData(parsed.progressData);
        }

        if (Array.isArray(parsed?.assetDistribution)) {
          setAssetDistribution(parsed.assetDistribution);
        }

        if (Array.isArray(parsed?.recentInspections)) {
          setRecentInspections(parsed.recentInspections);
        }

        if (Array.isArray(parsed?.recentActions)) {
          setRecentActions(parsed.recentActions);
        }

        if (Array.isArray(parsed?.recentReports)) {
          setRecentReports(parsed.recentReports);
        }

        if (parsed?.riskDistribution) {
          setRiskDistribution(parsed.riskDistribution);
        }
      }
    } catch (err) {
      console.error('dashboard snapshot cache parse 실패:', err);
    }

    try {
      const cached = window.sessionStorage.getItem(DASHBOARD_SUMMARY_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed?.summary) {
          setSummary(parsed.summary);
          setSummaryLoading(false);
        }
      }
    } catch (err) {
      console.error('dashboard summary cache parse 실패:', err);
    }

    loadDashboard();
  }, []);

  async function loadSummary() {
    const [assetsCountRes, checklistCountRes, targetsCountRes, vulnerableCountRes, completedCountRes, reportCountRes] =
      await Promise.all([
        supabase.from('assets').select('id', { count: 'planned', head: true }),
        supabase
          .from('check_items')
          .select('id', { count: 'planned', head: true })
          .eq('use_yn', '사용'),
        supabase
          .from('inspection_targets')
          .select('id', { count: 'planned', head: true })
          .in('target_status', ['선정', '점검중', '점검완료']),
        supabase
          .from('inspection_results')
          .select('id', { count: 'planned', head: true })
          .eq('result_status', '취약'),
        supabase
          .from('inspection_results')
          .select('id', { count: 'planned', head: true })
          .not('result_status', 'is', null)
          .neq('result_status', '미점검'),
        supabase.from('reports').select('id', { count: 'planned', head: true }),
      ]);

    if (assetsCountRes.error) throw assetsCountRes.error;
    if (checklistCountRes.error) throw checklistCountRes.error;
    if (targetsCountRes.error) throw targetsCountRes.error;
    if (vulnerableCountRes.error) throw vulnerableCountRes.error;
    if (completedCountRes.error) throw completedCountRes.error;
    if (reportCountRes.error) throw reportCountRes.error;

    const nextSummary = {
      totalAssets: assetsCountRes.count || 0,
      checklistCount: checklistCountRes.count || 0,
      targetCount: targetsCountRes.count || 0,
      vulnerableCount: vulnerableCountRes.count || 0,
      completedCount: completedCountRes.count || 0,
      reportCount: reportCountRes.count || 0,
    };

    setSummary(nextSummary);
    setSummaryLoading(false);

    try {
      window.sessionStorage.setItem(
        DASHBOARD_SUMMARY_CACHE_KEY,
        JSON.stringify({ summary: nextSummary, updatedAt: Date.now() })
      );
    } catch (err) {
      console.error('dashboard summary cache save 실패:', err);
    }
  }

  async function loadDashboard() {
    try {
      setLoading(true);
      setError('');

      if (!supabase) {
        throw new Error('Supabase 설정이 없습니다. .env 파일을 확인하세요.');
      }

      await loadSummary();

      const [
        assetsRes,
        targetsRes,
        resultsRes,
        vulnRes,
        reportsRes,
      ] = await Promise.all([
        supabase.from('assets').select('id, asset_type, asset_code'),
        supabase
          .from('inspection_targets')
          .select('id, asset_id, asset_code, target_status')
          .in('target_status', ['선정', '점검중', '점검완료']),
        supabase
          .from('inspection_results')
          .select(
            'id, asset_id, asset_code, item_code, item_name, result_status, risk_level, checked_at, updated_at'
          ),
        supabase
          .from('vulnerabilities')
          .select('id, vuln_title, action_status, asset_id, updated_at'),
        supabase
          .from('reports')
          .select('report_name, title, report_type, scope, created_at')
          .order('created_at', { ascending: false })
          .limit(5),
      ]);

      if (assetsRes.error) throw assetsRes.error;
      if (targetsRes.error) throw targetsRes.error;
      if (resultsRes.error) throw resultsRes.error;
      if (vulnRes.error) throw vulnRes.error;

      const reportsRows = reportsRes.error ? [] : reportsRes.data || [];

      const assets = assetsRes.data || [];
      const targets = targetsRes.data || [];
      const results = resultsRes.data || [];
      const vulnerabilities = vulnRes.data || [];
      const recentResults = [...results]
        .sort(
          (a, b) =>
            new Date(b.updated_at || b.checked_at || 0).getTime() -
            new Date(a.updated_at || a.checked_at || 0).getTime()
        )
        .slice(0, 5);
      const recentVulns = [...vulnerabilities]
        .sort(
          (a, b) =>
            new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime()
        )
        .slice(0, 5);

      const assetCodeMap = assets.reduce((acc, row) => {
        acc[row.id] = row.asset_code || '-';
        return acc;
      }, {});

      const selectedCount = targets.filter((row) => row.target_status === '선정').length;
      const inProgressCount = targets.filter((row) => row.target_status === '점검중').length;
      const doneCount = targets.filter((row) => row.target_status === '점검완료').length;
      const actionInProgressCount = vulnerabilities.filter((row) =>
        ['조치계획', '조치중', '검토중', '반려', '미조치', 'OPEN', 'IN_PROGRESS'].includes(
          row.action_status
        )
      ).length;

      const nextProgressData = [
        { label: '대상 선정', value: selectedCount, total: assets.length || 1, tone: 'blue' },
        { label: '점검 진행', value: inProgressCount, total: assets.length || 1, tone: 'amber' },
        { label: '조치 진행', value: actionInProgressCount, total: assets.length || 1, tone: 'violet' },
        { label: '점검 완료', value: doneCount, total: assets.length || 1, tone: 'emerald' },
      ];
      setProgressData(nextProgressData);

      const typeCountMap = assets.reduce((acc, row) => {
        const key = row.asset_type || 'ETC';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});

      const nextAssetDistribution =
        [
          { key: 'SERVER', colorClass: 'bg-sky-500' },
          { key: 'DATABASE', colorClass: 'bg-violet-500' },
          { key: 'WEB_APP', colorClass: 'bg-emerald-500' },
          { key: 'WAS', colorClass: 'bg-amber-400' },
          { key: 'NETWORK', colorClass: 'bg-rose-500' },
          { key: 'SECURITY', colorClass: 'bg-cyan-500' },
          { key: 'ETC', colorClass: 'bg-slate-400' },
        ]
          .map((item) => ({
            label: TYPE_LABEL_MAP[item.key] || item.key,
            value: typeCountMap[item.key] || 0,
            colorClass: item.colorClass,
          }))
          .filter((item) => item.value > 0);
      setAssetDistribution(nextAssetDistribution);

      const nextRecentInspections = recentResults.map((row) => {
          let tone = 'slate';
          if (row.result_status === '취약') tone = 'rose';
          else if (row.result_status === '양호') tone = 'emerald';
          else if (row.result_status === '재확인' || row.result_status === '예외') tone = 'amber';

          return {
            target: row.asset_code || '-',
            item: row.item_code || row.item_name || '-',
            result: <StatusBadge tone={tone}>{row.result_status || '-'}</StatusBadge>,
            time: row.updated_at
              ? String(row.updated_at).slice(0, 16).replace('T', ' ')
              : row.checked_at
              ? String(row.checked_at).slice(0, 16).replace('T', ' ')
              : '-',
          };
        });
      setRecentInspections(nextRecentInspections);

      const nextRecentActions = recentVulns.map((row) => {
          let tone = 'amber';
          if (['완료', 'DONE'].includes(row.action_status)) tone = 'emerald';
          else if (['조치중', 'IN_PROGRESS'].includes(row.action_status)) tone = 'blue';
          else if (['조치계획', '미조치', 'OPEN'].includes(row.action_status)) tone = 'rose';
          else if (['검토중'].includes(row.action_status)) tone = 'violet';
          else if (['예외승인'].includes(row.action_status)) tone = 'slate';

          return {
            asset: assetCodeMap[row.asset_id] || '-',
            title: row.vuln_title || '-',
            status: <StatusBadge tone={tone}>{row.action_status || '-'}</StatusBadge>,
            owner: '-',
          };
        });
      setRecentActions(nextRecentActions);

      const nextRecentReports = reportsRows.map((row) => ({
          name: row.report_name || row.title || '-',
          type: row.report_type || row.scope || '-',
          created: row.created_at
            ? String(row.created_at).slice(0, 16).replace('T', ' ')
            : '-',
        }));
      setRecentReports(nextRecentReports);

      const nextRiskDistribution = {
        high: results.filter((row) => row.result_status === '취약' && row.risk_level === '상').length,
        medium: results.filter((row) => row.result_status === '취약' && row.risk_level === '중').length,
        low: results.filter((row) => row.result_status === '취약' && row.risk_level === '하').length,
      };
      setRiskDistribution(nextRiskDistribution);

      try {
        window.sessionStorage.setItem(
          DASHBOARD_SNAPSHOT_CACHE_KEY,
          JSON.stringify({
            summary: nextSummary,
            progressData: nextProgressData,
            assetDistribution: nextAssetDistribution,
            recentInspections: nextRecentInspections.map((row) => ({
              ...row,
              resultTone:
                row.result?.props?.tone || 'slate',
              resultLabel:
                row.result?.props?.children || '-',
            })),
            recentActions: nextRecentActions.map((row) => ({
              ...row,
              statusTone:
                row.status?.props?.tone || 'slate',
              statusLabel:
                row.status?.props?.children || '-',
            })),
            recentReports: nextRecentReports,
            riskDistribution: nextRiskDistribution,
            updatedAt: Date.now(),
          })
        );
      } catch (err) {
        console.error('dashboard snapshot cache save 실패:', err);
      }
    } catch (err) {
      console.error(err);
      setError(err.message || '대시보드 조회 실패');
    } finally {
      setSummaryLoading(false);
      setLoading(false);
    }
  }

  const totalDistribution = useMemo(
    () => assetDistribution.reduce((acc, cur) => acc + cur.value, 0),
    [assetDistribution]
  );

  const inspectionRowsForView = useMemo(
    () =>
      recentInspections.map((row) => ({
        ...row,
        result:
          React.isValidElement(row.result) ? (
            row.result
          ) : (
            <StatusBadge tone={row.resultTone || 'slate'}>{row.resultLabel || row.result || '-'}</StatusBadge>
          ),
      })),
    [recentInspections]
  );

  const actionRowsForView = useMemo(
    () =>
      recentActions.map((row) => ({
        ...row,
        status:
          React.isValidElement(row.status) ? (
            row.status
          ) : (
            <StatusBadge tone={row.statusTone || 'slate'}>{row.statusLabel || row.status || '-'}</StatusBadge>
          ),
      })),
    [recentActions]
  );

  return (
    <div className="space-y-3">
      {error ? (
        <Card className="border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-600">
          {error}
        </Card>
      ) : null}

      <section className="grid grid-cols-3 gap-3 md:grid-cols-2 xl:grid-cols-6">
        <KpiCard
          title="전체 자산"
          value={summaryLoading ? '-' : summary.totalAssets}
          sub="등록된 정보자산 수"
          icon={Layers3}
          tone="blue"
        />
        <KpiCard
          title="사용 중 기준"
          value={summaryLoading ? '-' : summary.checklistCount}
          sub="활성 점검 기준 수"
          icon={ClipboardList}
          tone="violet"
        />
        <KpiCard
          title="점검 대상"
          value={summaryLoading ? '-' : summary.targetCount}
          sub="현재 선정된 자산 수"
          icon={Target}
          tone="emerald"
        />
        <KpiCard
          title="점검 완료"
          value={summaryLoading ? '-' : summary.completedCount}
          sub="결과 등록 완료 수"
          icon={BadgeCheck}
          tone="blue"
        />
        <KpiCard
          title="미조치 취약점"
          value={summaryLoading ? '-' : summary.vulnerableCount}
          sub="취약 판정 누적 수"
          icon={AlertTriangle}
          tone="rose"
        />
        <KpiCard
          title="보고서"
          value={summaryLoading ? '-' : summary.reportCount}
          sub="생성된 보고서 수"
          icon={FileText}
          tone="violet"
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <Card className="overflow-hidden">
          <SectionTitle
            icon={Activity}
            title="단계별 진행 상황"
            desc="대상 선정부터 점검 완료까지"
          />
          <div className="space-y-4 px-4 py-4">
            {progressData.map((item) => (
              <ProgressRow
                key={item.label}
                label={item.label}
                value={item.value}
                total={item.total}
                tone={item.tone}
              />
            ))}
          </div>
        </Card>

        <Card className="overflow-hidden">
          <SectionTitle
            icon={PieChart}
            title="자산 유형별 분포"
            desc="자산 유형 구성 현황"
          />
          <div className="space-y-2 px-4 py-4">
            {assetDistribution.map((item) => (
              <DistributionRow
                key={item.label}
                label={item.label}
                value={item.value}
                total={totalDistribution}
                colorClass={item.colorClass}
              />
            ))}
          </div>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <Card className="overflow-hidden">
          <SectionTitle
            icon={ClipboardList}
            title="최근 점검 결과"
            desc="최근 등록된 점검 이력"
          />
          <SimpleTable
            columns={[
              { key: 'target', label: '자산' },
              { key: 'item', label: '항목' },
              { key: 'result', label: '결과' },
              { key: 'time', label: '시간' },
            ]}
            rows={inspectionRowsForView}
          />
        </Card>

        <Card className="overflow-hidden">
          <SectionTitle
            icon={Wrench}
            title="최근 조치 현황"
            desc="최근 변경된 조치 상태"
          />
          <SimpleTable
            columns={[
              { key: 'asset', label: '자산' },
              { key: 'title', label: '취약점' },
              { key: 'status', label: '상태' },
              { key: 'owner', label: '담당' },
            ]}
            rows={actionRowsForView}
          />
        </Card>

        <Card className="overflow-hidden">
          <SectionTitle
            icon={FileText}
            title="최근 보고서 생성"
            desc="최근 생성된 보고서"
          />
          <SimpleTable
            columns={[
              { key: 'name', label: '보고서명' },
              { key: 'type', label: '유형' },
              { key: 'created', label: '생성일시' },
            ]}
            rows={recentReports}
            emptyText="reports 테이블 데이터가 없습니다."
          />
        </Card>
      </section>

    </div>
  );
}
