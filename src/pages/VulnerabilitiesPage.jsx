import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

const PAGE_SIZE = 20;

const TYPE_OPTIONS = [
  { label: '전체', value: 'ALL' },
  { label: '서버시스템', value: 'SERVER' },
  { label: '데이터베이스', value: 'DATABASE' },
  { label: '웹애플리케이션', value: 'WEB_APP' },
  { label: 'WAS', value: 'WAS' },
  { label: '네트워크장비', value: 'NETWORK' },
  { label: '보안솔루션', value: 'SECURITY' },
  { label: '기타', value: 'ETC' },
];

const TYPE_LABELS = {
  SERVER: '서버시스템',
  DATABASE: '데이터베이스',
  WEB_APP: '웹애플리케이션',
  WAS: 'WAS',
  NETWORK: '네트워크장비',
  SECURITY: '보안솔루션',
  ETC: '기타',
};

const ACTION_STATUS_OPTIONS = ['조치계획', '진행 중', '완료'];
const CONFIRM_WORD_POOL = ['VULN', 'ACTION', 'VERIFY', 'REVIEW', 'FIX', 'REPORT'];

function Card({ children, className = '' }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {children}
    </div>
  );
}

function SectionHeader({ title, desc, action }) {
  return (
    <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 xl:flex-row xl:items-center xl:justify-between">
      <div>
        <div className="text-lg font-semibold text-slate-900">{title}</div>
        <div className="mt-0.5 text-xs text-slate-500">{desc}</div>
      </div>
      {action}
    </div>
  );
}

function Badge({ value }) {
  const styleMap = {
    상: 'bg-rose-100 text-rose-700',
    중: 'bg-amber-100 text-amber-700',
    하: 'bg-emerald-100 text-emerald-700',
    조치계획: 'bg-amber-100 text-amber-700',
    '진행 중': 'bg-sky-100 text-sky-700',
    완료: 'bg-emerald-100 text-emerald-700',
  };

  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        styleMap[value] || 'bg-slate-100 text-slate-700'
      }`}
    >
      {value || '-'}
    </span>
  );
}

function normalizeActionStatus(value) {
  const v = String(value || '').trim();
  if (!v) return '조치계획';
  if (['조치계획', 'OPEN', 'PLAN'].includes(v)) return '조치계획';
  if (['조치중', '진행 중', 'IN_PROGRESS'].includes(v)) return '진행 중';
  if (['조치완료', '완료', 'DONE'].includes(v)) return '완료';
  return v;
}

function normalizeChecklistRow(row) {
  return {
    ...row,
    normalized_type: row.asset_type || '',
    normalized_item_code: row.item_code || row.source_item_code || '',
    normalized_item_name: row.item_name || '',
    normalized_criteria: row.check_criteria || row.description || '',
    normalized_risk_level: row.risk_level || '중',
  };
}

function SectionField({ label, children }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-slate-500">{label}</div>
      {children}
    </div>
  );
}

function VulnerabilityInlineDetail({ row, saving, reviewerName, onSave, locked = false }) {
  const [actionStatus, setActionStatus] = useState(normalizeActionStatus(row.action_status));
  const [dueDate, setDueDate] = useState(row.due_date ? String(row.due_date).slice(0, 10) : '');
  const [assigneeName, setAssigneeName] = useState(row.assignee_name || '');
  const [actionResult, setActionResult] = useState(row.action_result || '');
  const [reviewComment, setReviewComment] = useState(row.review_comment || '');

  useEffect(() => {
    setActionStatus(normalizeActionStatus(row.action_status));
    setDueDate(row.due_date ? String(row.due_date).slice(0, 10) : '');
    setAssigneeName(row.assignee_name || '');
    setActionResult(row.action_result || '');
    setReviewComment(row.review_comment || '');
  }, [row]);

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
      <div className="grid grid-cols-2 gap-4">
        <SectionField label="점검 항목명">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800">
            {row.item_name || row.vuln_title || '-'}
          </div>
        </SectionField>

        <SectionField label="판정 결과">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
            {row.result_status || '-'}
          </div>
        </SectionField>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <SectionField label="판정 기준">
          <textarea
            value={row.criteria || ''}
            readOnly
            rows={8}
            wrap="off"
            className="w-full overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-[11px] leading-5 whitespace-pre outline-none"
          />
        </SectionField>

        <SectionField label="현황">
          <textarea
            value={row.result_text || ''}
            readOnly
            rows={8}
            wrap="off"
            className="w-full overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-[11px] leading-5 whitespace-pre outline-none"
          />
        </SectionField>
      </div>

      <SectionField label="취약 판정 근거">
        <textarea
          value={row.vuln_reason || row.result_text || ''}
          readOnly
          rows={5}
          wrap="off"
          className="w-full overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-[11px] leading-5 whitespace-pre outline-none"
        />
      </SectionField>

      <div className="grid grid-cols-4 gap-4">
        <SectionField label="위험도">
          <select
            value={row.risk_level || '중'}
            disabled
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none"
          >
            <option value="상">상</option>
            <option value="중">중</option>
            <option value="하">하</option>
          </select>
        </SectionField>

        <SectionField label="조치 상태">
          <select
            value={actionStatus}
            onChange={(e) => setActionStatus(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none"
          >
            {ACTION_STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </SectionField>

        <SectionField label="조치 예정일">
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none"
          />
        </SectionField>

        <SectionField label="조치 담당자">
          <input
            value={assigneeName}
            onChange={(e) => setAssigneeName(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none"
            placeholder="조치 담당자 입력"
          />
        </SectionField>
      </div>

      <SectionField label="조치 결과">
        <textarea
          value={actionResult}
          onChange={(e) => setActionResult(e.target.value)}
          rows={5}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none"
          placeholder="조치 결과 입력"
        />
      </SectionField>

      <div className="grid grid-cols-[1fr_260px] gap-4">
        <SectionField label="검토 의견">
          <textarea
            value={reviewComment}
            onChange={(e) => setReviewComment(e.target.value)}
            rows={5}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none"
            placeholder="검토 의견 입력"
          />
        </SectionField>

        <SectionField label="검토자(admin)">
          <input
            value={reviewerName}
            readOnly
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none"
          />
        </SectionField>
      </div>

      <div className="flex justify-end">
        <button
          onClick={() =>
            onSave({
              ...row,
              action_status: actionStatus,
              due_date: dueDate || null,
              assignee_name: assigneeName,
              action_result: actionResult,
              review_comment: reviewComment,
              reviewed_by: reviewerName || null,
            })
          }
          disabled={saving || locked}
          className="rounded-lg bg-slate-950 px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          {locked ? '확정 완료' : saving ? '저장 중...' : '저장'}
        </button>
      </div>
    </div>
  );
}

function VulnerabilityRow({ row, expanded, onToggle, saving, reviewerName, onSave, locked = false }) {
  return (
    <>
      <tr
        onClick={onToggle}
        className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
      >
        <td className="px-3 py-2 text-center whitespace-nowrap">{row.asset_code || '-'}</td>
        <td className="px-3 py-2 text-center whitespace-nowrap">
          {TYPE_LABELS[row.asset_type] || row.asset_type || '-'}
        </td>
        <td className="px-3 py-2 text-center whitespace-nowrap">{row.item_code || '-'}</td>
        <td className="px-3 py-2 text-left text-slate-700">{row.vuln_title || '-'}</td>
        <td className="px-3 py-2 text-center whitespace-nowrap">
          <Badge value={row.risk_level} />
        </td>
        <td className="px-3 py-2 text-center whitespace-nowrap">
          <Badge value={normalizeActionStatus(row.action_status)} />
        </td>
        <td className="px-3 py-2 text-center whitespace-nowrap">
          {row.due_date ? String(row.due_date).slice(0, 10) : '-'}
        </td>
        <td className="px-3 py-2 text-center whitespace-nowrap">
          {row.updated_at ? String(row.updated_at).slice(0, 16).replace('T', ' ') : '-'}
        </td>
      </tr>

      {expanded ? (
        <tr className="border-t border-slate-100 bg-slate-50">
          <td colSpan={8} className="px-4 py-4">
            <VulnerabilityInlineDetail
              row={row}
              saving={saving}
              reviewerName={reviewerName}
              onSave={onSave}
              locked={locked}
            />
          </td>
        </tr>
      ) : null}
    </>
  );
}

export default function VulnerabilityPage({
  vulnerabilityConfirmed = false,
  onConfirmVulnerabilities,
  onCancelVulnerabilitiesConfirmation,
}) {
  const [rows, setRows] = useState([]);
  const [inspectionMap, setInspectionMap] = useState({});
  const [assetMap, setAssetMap] = useState({});
  const [checkMap, setCheckMap] = useState({});

  const [keyword, setKeyword] = useState('');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const [expandedRowId, setExpandedRowId] = useState(null);
  const [reviewerName, setReviewerName] = useState('admin');

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [confirmWord, setConfirmWord] = useState('');
  const [confirmInput, setConfirmInput] = useState('');
  const [confirmError, setConfirmError] = useState('');

  useEffect(() => {
    if (vulnerabilityConfirmed) return;

    const nextWord =
      CONFIRM_WORD_POOL[Math.floor(Math.random() * CONFIRM_WORD_POOL.length)] +
      '-' +
      String(Math.floor(1000 + Math.random() * 9000));

    setConfirmWord(nextWord);
    setConfirmInput('');
    setConfirmError('');
  }, [vulnerabilityConfirmed]);

  useEffect(() => {
    async function init() {
      try {
        setLoading(true);
        setError('');
        await Promise.all([
          fetchVulnerabilities(),
          fetchInspectionResults(),
          fetchAssets(),
          fetchCheckItems(),
          loadReviewer(),
        ]);
      } catch (err) {
        console.error(err);
        setError(err.message || '취약점 조회 실패');
      } finally {
        setLoading(false);
      }
    }

    init();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchKeyword, typeFilter, statusFilter]);

  async function loadReviewer() {
    try {
      const { data } = await supabase.auth.getUser();
      const email = data?.user?.email || 'admin';
      setReviewerName(email);
    } catch {
      setReviewerName('admin');
    }
  }

  async function fetchVulnerabilities() {
    const { data, error } = await supabase
      .from('vulnerabilities')
      .select('*')
      .order('updated_at', { ascending: false });

    if (error) throw error;
    setRows(data || []);
  }

  async function fetchInspectionResults() {
    const { data, error } = await supabase
      .from('inspection_results')
      .select(
        'id, asset_code, asset_type, item_code, item_name, result_status, result_text, check_text, risk_level'
      );

    if (error) throw error;

    const map = {};
    (data || []).forEach((row) => {
      map[row.id] = row;
    });
    setInspectionMap(map);
  }

  async function fetchAssets() {
    const { data, error } = await supabase
      .from('assets')
      .select('id, asset_code, asset_type');

    if (error) throw error;

    const map = {};
    (data || []).forEach((row) => {
      map[row.id] = row;
    });
    setAssetMap(map);
  }

  async function fetchCheckItems() {
    const { data, error } = await supabase
      .from('check_items')
      .select('id, asset_type, item_code, source_item_code, item_name, check_criteria, description, risk_level');

    if (error) throw error;

    const map = {};
    (data || []).forEach((row) => {
      map[row.id] = normalizeChecklistRow(row);
    });
    setCheckMap(map);
  }

  const mergedRows = useMemo(() => {
    return rows.map((row) => {
      const inspection = inspectionMap[row.inspection_result_id] || {};
      const asset = assetMap[row.asset_id] || {};
      const check = checkMap[row.item_id] || {};

      return {
        ...row,
        asset_code: inspection.asset_code || asset.asset_code || '-',
        asset_type: inspection.asset_type || asset.asset_type || '',
        item_code: inspection.item_code || check.normalized_item_code || '-',
        item_name: inspection.item_name || check.normalized_item_name || row.vuln_title || '',
        result_status: inspection.result_status || '',
        result_text: inspection.result_text || '',
        criteria: inspection.check_text || check.normalized_criteria || '',
        vuln_reason: inspection.result_text || '',
        risk_level: row.risk_level || inspection.risk_level || check.normalized_risk_level || '중',
        action_status: normalizeActionStatus(row.action_status),
      };
    });
  }, [rows, inspectionMap, assetMap, checkMap]);

  const filteredRows = useMemo(() => {
    const q = searchKeyword.trim().toLowerCase();

    return mergedRows.filter((row) => {
      const typeMatched = typeFilter === 'ALL' || row.asset_type === typeFilter;
      const statusMatched =
        statusFilter === 'ALL' || normalizeActionStatus(row.action_status) === statusFilter;

      if (!typeMatched || !statusMatched) return false;

      if (!q) return true;

      return [row.asset_code, row.item_code, row.vuln_title]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [mergedRows, searchKeyword, typeFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));

  const pagedRows = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredRows.slice(start, start + PAGE_SIZE);
  }, [filteredRows, currentPage]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  async function handleSaveInline(row) {
    try {
      if (vulnerabilityConfirmed) {
        throw new Error('취약점 확정 후에는 저장할 수 없습니다.');
      }

      setSaving(true);
      setMessage('');
      setError('');

      const payload = {
        action_status: row.action_status,
        assignee_name: row.assignee_name || null,
        due_date: row.due_date || null,
        action_result: row.action_result || '',
        review_comment: row.review_comment || '',
        reviewed_by: row.reviewed_by || reviewerName || 'admin',
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('vulnerabilities')
        .update(payload)
        .eq('id', row.id);

      if (error) throw error;

      await fetchVulnerabilities();
      setMessage('취약점 조치 정보가 저장되었습니다.');
    } catch (err) {
      console.error(err);
      setError(err.message || '취약점 저장 실패');
    } finally {
      setSaving(false);
    }
  }

  const kpis = useMemo(() => {
    const total = mergedRows.length;
    const planCount = mergedRows.filter((row) => normalizeActionStatus(row.action_status) === '조치계획').length;
    const progressCount = mergedRows.filter((row) => normalizeActionStatus(row.action_status) === '진행 중').length;
    const doneCount = mergedRows.filter((row) => normalizeActionStatus(row.action_status) === '완료').length;

    return [
      { title: '전체 취약 건수', value: total, sub: '등록된 취약 항목 수' },
      { title: '조치계획', value: planCount, sub: '계획 수립 단계' },
      { title: '진행 중', value: progressCount, sub: '조치 수행 단계' },
      { title: '완료', value: doneCount, sub: '조치 완료 단계' },
    ];
  }, [mergedRows]);

  return (
    <div className="space-y-4">
      <Card className={vulnerabilityConfirmed ? 'border-emerald-300 bg-emerald-50/70' : ''}>
        <div className="flex w-full flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="w-full lg:flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600">
              <span>취약점 조치 검토가 끝났다면 확인키를 입력해 확정하세요.</span>
              {vulnerabilityConfirmed ? (
                <span className="text-xs font-semibold text-slate-900">확정 완료</span>
              ) : (
                <span className="text-xs font-semibold text-slate-900">
                  확인키: <span className="text-rose-600">{confirmWord || '-'}</span>
                </span>
              )}
            </div>
          </div>

          {vulnerabilityConfirmed ? (
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-end lg:w-auto">
              <div className="inline-flex h-8 items-center rounded-lg border border-emerald-300 bg-white px-3 text-xs font-medium text-emerald-700">
                취약점 확정 완료
              </div>
              <button
                onClick={onCancelVulnerabilitiesConfirmation}
                className="inline-flex h-8 items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700"
              >
                취약점 확정 취소
              </button>
            </div>
          ) : (
            <div className="flex w-full flex-col gap-2 text-right lg:flex-1 lg:items-end">
              <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                <input
                  value={confirmInput}
                  onChange={(e) => setConfirmInput(e.target.value)}
                  className="h-8 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs outline-none sm:max-w-[240px]"
                  placeholder="확인키를 정확히 입력하세요"
                />
                <button
                  onClick={() => {
                    setMessage('');
                    setError('');
                    setConfirmError('');
                    if (!rows.length) {
                      setConfirmError('확정할 취약점 항목이 없습니다.');
                      return;
                    }
                    if (confirmInput.trim() !== confirmWord) {
                      setConfirmError('확인키가 일치하지 않습니다.');
                      return;
                    }
                    onConfirmVulnerabilities?.();
                    setMessage('취약점 관리가 확정되었습니다. 보고서 관리가 활성화되었습니다.');
                  }}
                  className="inline-flex h-8 items-center rounded-lg bg-slate-950 px-3 text-xs font-semibold text-white sm:w-auto"
                >
                  취약점 확정
                </button>
              </div>
              {confirmError ? <div className="text-xs text-rose-600">{confirmError}</div> : null}
            </div>
          )}
        </div>
      </Card>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((item) => (
          <Card key={item.title} className="p-3 sm:p-3.5 w-full">
            <div className="text-xs font-medium text-slate-500">{item.title}</div>
            <div className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight">{item.value}</div>
            <div className="mt-1 sm:mt-2 text-xs text-slate-500">{item.sub}</div>
          </Card>
        ))}
      </section>

      <Card className="overflow-hidden">
        <SectionHeader
          title="취약점 관리"
          desc="조치 계획 및 조치 결과를 관리합니다."
          action={
            <div className="flex w-full flex-col gap-2 xl:w-auto xl:flex-row xl:items-center">
              <div className="flex w-full gap-2 xl:w-auto">
                <input
                  value={keyword}
                  onChange={(e) => {
                    const nextKeyword = e.target.value;
                    setKeyword(nextKeyword);
                    setSearchKeyword(nextKeyword);
                  }}
                  placeholder="자산코드, 항목코드, 취약점명 검색"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none placeholder:text-slate-400 xl:w-[320px]"
                />
              </div>
            </div>
          }
        />

        {(message || error) && (
          <div className="border-b border-slate-200 px-5 py-3">
            {message ? (
              <div className="text-xs text-emerald-600">{message}</div>
            ) : (
              <div className="text-xs text-rose-600">{error}</div>
            )}
          </div>
        )}

        <div className="border-b border-slate-200 bg-slate-50 px-5 py-3">
          <div className="flex flex-wrap items-center gap-2">
            {TYPE_OPTIONS.map((item) => (
              <button
                key={item.value}
                onClick={() => setTypeFilter(item.value)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                  typeFilter === item.value
                    ? 'bg-slate-950 text-white'
                    : 'border border-slate-200 bg-white text-slate-600'
                }`}
              >
                {item.label}
              </button>
            ))}

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="ml-auto rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none"
            >
              <option value="ALL">전체 상태</option>
              <option value="조치계획">조치계획</option>
              <option value="진행 중">진행 중</option>
              <option value="완료">완료</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-3 py-2 text-center font-bold whitespace-nowrap">자산코드</th>
                <th className="px-3 py-2 text-center font-bold whitespace-nowrap">구분</th>
                <th className="px-3 py-2 text-center font-bold whitespace-nowrap">항목코드</th>
                <th className="px-3 py-2 text-center font-bold whitespace-nowrap">취약점명</th>
                <th className="px-3 py-2 text-center font-bold whitespace-nowrap">위험도</th>
                <th className="px-3 py-2 text-center font-bold whitespace-nowrap">조치상태</th>
                <th className="px-3 py-2 text-center font-bold whitespace-nowrap">조치예정일</th>
                <th className="px-3 py-2 text-center font-bold whitespace-nowrap">수정일</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                    취약점 데이터를 불러오는 중입니다.
                  </td>
                </tr>
              ) : pagedRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                    표시할 취약점이 없습니다.
                  </td>
                </tr>
              ) : (
                pagedRows.map((row) => (
                  <VulnerabilityRow
                    key={row.id}
                    row={row}
                    expanded={expandedRowId === row.id}
                    onToggle={() =>
                      setExpandedRowId((prev) => (prev === row.id ? null : row.id))
                    }
                    reviewerName={reviewerName}
                    onSave={handleSaveInline}
                    saving={saving}
                    locked={vulnerabilityConfirmed}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3">
          <div className="text-xs text-slate-500">
            총 {filteredRows.length}건 / 페이지 {currentPage} of {totalPages}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 disabled:opacity-50"
            >
              이전
            </button>
            <button
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 disabled:opacity-50"
            >
              다음
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}
