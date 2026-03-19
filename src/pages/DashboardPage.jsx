import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  BarChart3,
  ClipboardList,
  FileText,
  Layers3,
  PieChart,
  Target,
  Wrench,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

const DASHBOARD_SUMMARY_CACHE_KEY = 'dashboard-summary-cache';

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
    <div className={`rounded-2xl bg-gradient-to-br ${toneMap[tone]} p-4 shadow-sm`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-medium text-white/85">{title}</div>
          <div className="mt-2 text-[28px] font-bold tracking-tight">{value}</div>
          <div className="mt-1 text-[11px] text-white/80">{sub}</div>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/20">
          <Icon size={18} />
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
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${toneMap[tone]}`}>
      {children}
    </span>
  );
}

function SimpleTable({ rows, columns, emptyText = '표시할 데이터가 없습니다.' }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-xs">
        <thead className="bg-slate-50 text-slate-500">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className={`px-3 py-2 font-semibold ${
                  col.align === 'right'
                    ? 'text-right'
                    : col.align === 'left'
                    ? 'text-left'
                    : 'text-center'
                } whitespace-nowrap`}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-6 text-center text-slate-400">
                {emptyText}
              </td>
            </tr>
          ) : (
            rows.map((row, idx) => (
              <tr key={idx} className="border-t border-slate-100">
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-3 py-2 text-slate-700 ${
                      col.align === 'right'
                        ? 'text-right'
                        : col.align === 'left'
                        ? 'text-left'
                        : 'text-center'
                    } whitespace-nowrap`}
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
    targetCount: 0,
    vulnerableCount: 0,
    completedCount: 0,
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
    const [assetsCountRes, targetsCountRes, vulnerableCountRes, completedCountRes] =
      await Promise.all([
        supabase.from('assets').select('id', { count: 'exact', head: true }),
        supabase
          .from('inspection_targets')
          .select('id', { count: 'exact', head: true })
          .in('target_status', ['선정', '점검중', '점검완료']),
        supabase
          .from('inspection_results')
          .select('id', { count: 'exact', head: true })
          .eq('result_status', '취약'),
        supabase
          .from('inspection_results')
          .select('id', { count: 'exact', head: true })
          .not('result_status', 'is', null)
          .neq('result_status', '미점검'),
      ]);

    if (assetsCountRes.error) throw assetsCountRes.error;
    if (targetsCountRes.error) throw targetsCountRes.error;
    if (vulnerableCountRes.error) throw vulnerableCountRes.error;
    if (completedCountRes.error) throw completedCountRes.error;

    const nextSummary = {
      totalAssets: assetsCountRes.count || 0,
      targetCount: targetsCountRes.count || 0,
      vulnerableCount: vulnerableCountRes.count || 0,
      completedCount: completedCountRes.count || 0,
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

      setProgressData([
        { label: '대상 선정', value: selectedCount, total: assets.length || 1, tone: 'blue' },
        { label: '점검 진행', value: inProgressCount, total: assets.length || 1, tone: 'amber' },
        { label: '조치 진행', value: actionInProgressCount, total: assets.length || 1, tone: 'violet' },
        { label: '점검 완료', value: doneCount, total: assets.length || 1, tone: 'emerald' },
      ]);

      const typeCountMap = assets.reduce((acc, row) => {
        const key = row.asset_type || 'ETC';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});

      setAssetDistribution(
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
          .filter((item) => item.value > 0)
      );

      setRecentInspections(
        recentResults.map((row) => {
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
        })
      );

      setRecentActions(
        recentVulns.map((row) => {
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
        })
      );

      setRecentReports(
        reportsRows.map((row) => ({
          name: row.report_name || row.title || '-',
          type: row.report_type || row.scope || '-',
          created: row.created_at
            ? String(row.created_at).slice(0, 16).replace('T', ' ')
            : '-',
        }))
      );

      setRiskDistribution({
        high: results.filter((row) => row.result_status === '취약' && row.risk_level === '상').length,
        medium: results.filter((row) => row.result_status === '취약' && row.risk_level === '중').length,
        low: results.filter((row) => row.result_status === '취약' && row.risk_level === '하').length,
      });
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

  return (
    <div className="space-y-3">
      {error ? (
        <Card className="border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-600">
          {error}
        </Card>
      ) : null}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="전체 자산"
          value={summaryLoading ? '-' : summary.totalAssets}
          sub="등록된 정보자산 수"
          icon={Layers3}
          tone="blue"
        />
        <KpiCard
          title="점검 대상"
          value={summaryLoading ? '-' : summary.targetCount}
          sub="현재 점검 대상 수"
          icon={Target}
          tone="violet"
        />
        <KpiCard
          title="취약 건수"
          value={summaryLoading ? '-' : summary.vulnerableCount}
          sub="취약 판정 결과"
          icon={AlertTriangle}
          tone="rose"
        />
        <KpiCard
          title="점검 완료"
          value={summaryLoading ? '-' : summary.completedCount}
          sub="미점검 제외 결과 수"
          icon={BadgeCheck}
          tone="emerald"
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
            rows={recentInspections}
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
            rows={recentActions}
          />
        </Card>

        <Card className="overflow-hidden">
          <SectionTitle
            icon={BarChart3}
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

      <section className="grid gap-4 xl:grid-cols-3">
        <Card className="overflow-hidden">
          <SectionTitle icon={AlertTriangle} title="위험도 분포" />
          <div className="grid grid-cols-3 gap-2 px-4 py-4">
            <div className="rounded-xl bg-rose-50 px-3 py-3 text-center">
              <div className="text-[11px] font-medium text-rose-600">상</div>
              <div className="mt-1 text-lg font-bold text-rose-700">
                {loading ? '-' : riskDistribution.high}
              </div>
            </div>
            <div className="rounded-xl bg-amber-50 px-3 py-3 text-center">
              <div className="text-[11px] font-medium text-amber-600">중</div>
              <div className="mt-1 text-lg font-bold text-amber-700">
                {loading ? '-' : riskDistribution.medium}
              </div>
            </div>
            <div className="rounded-xl bg-emerald-50 px-3 py-3 text-center">
              <div className="text-[11px] font-medium text-emerald-600">하</div>
              <div className="mt-1 text-lg font-bold text-emerald-700">
                {loading ? '-' : riskDistribution.low}
              </div>
            </div>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <SectionTitle icon={FileText} title="점검 상태 요약" />
          <div className="space-y-2 px-4 py-4 text-xs">
            <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
              <span className="text-slate-600">취약</span>
              <span className="font-semibold text-rose-600">{summary.vulnerableCount}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
              <span className="text-slate-600">점검 완료</span>
              <span className="font-semibold text-slate-900">{summary.completedCount}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
              <span className="text-slate-600">점검 대상</span>
              <span className="font-semibold text-slate-900">{summary.targetCount}</span>
            </div>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <SectionTitle icon={BadgeCheck} title="운영 포인트" />
          <div className="space-y-2 px-4 py-4 text-xs text-slate-600">
            <div className="rounded-xl bg-sky-50 px-3 py-2 text-sky-700">
              최근 점검 결과와 취약 조치 상태를 실데이터로 집계합니다.
            </div>
            <div className="rounded-xl bg-amber-50 px-3 py-2 text-amber-700">
              reports 테이블이 없거나 비어 있으면 보고서 영역은 빈 상태로 표시됩니다.
            </div>
            <div className="rounded-xl bg-emerald-50 px-3 py-2 text-emerald-700">
              자산 유형 분포와 점검 진행 상황은 DB 기준으로 자동 계산됩니다.
            </div>
          </div>
        </Card>
      </section>
    </div>
  );
}
