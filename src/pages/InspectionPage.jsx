import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { runSupabaseMutation } from '../utils/supabaseMutation';

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

const RESULT_OPTIONS = ['양호', '취약', '예외'];
const CONFIRM_WORD_POOL = ['RESULT', 'VERIFY', 'COMPLETE', 'CHECK', 'APPROVE', 'STAGE'];

function Card({ children, className = '' }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {children}
    </div>
  );
}

function Badge({ value }) {
  const styleMap = {
    상: 'bg-rose-100 text-rose-700',
    중: 'bg-amber-100 text-amber-700',
    하: 'bg-emerald-100 text-emerald-700',
    취약: 'bg-rose-100 text-rose-700',
    양호: 'bg-emerald-100 text-emerald-700',
    예외: 'bg-slate-100 text-slate-700',
    재확인: 'bg-slate-100 text-slate-700',
    점검전: 'bg-slate-100 text-slate-600',
    점검완료: 'bg-violet-100 text-violet-700',
    조치계획: 'bg-amber-100 text-amber-700',
    해당없음: 'bg-slate-100 text-slate-700',
  };

  return (
    <span
      className={`inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-semibold leading-4 ${
        styleMap[value] || 'bg-slate-100 text-slate-700'
      }`}
    >
      {value || '-'}
    </span>
  );
}

function SectionHeader({ title, desc, action }) {
  return (
    <div className="flex min-h-[88px] flex-col gap-3 border-b border-slate-200 px-5 py-4 xl:flex-row xl:items-center xl:justify-between">
      <div className="flex min-h-[56px] flex-col justify-center">
        <div className="text-lg font-semibold text-slate-900">{title}</div>
        <div className="mt-0.5 text-xs text-slate-500">{desc}</div>
      </div>
      {action}
    </div>
  );
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

function typeMatchesChecklist(assetType, checklistRow) {
  if (!assetType) return true;
  const raw = String(checklistRow.normalized_type || '').toUpperCase().trim();
  if (!raw) return true;
  return raw === String(assetType).toUpperCase().trim();
}

function normalizeCodeKey(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[\[\]\s<>]/g, '')
    .trim();
}

function codesMatch(dbCode, parsedCode) {
  const a = normalizeCodeKey(dbCode);
  const b = normalizeCodeKey(parsedCode);

  if (!a || !b) return false;
  if (a === b) return true;
  if (a.endsWith(`-${b}`)) return true;
  if (b.endsWith(`-${a}`)) return true;
  return false;
}

function normalizeScriptResult(raw) {
  const value = String(raw || '').trim().toUpperCase();

  if (['GOOD', 'OK', '양호'].includes(value)) return '양호';
  if (['WEAK', 'BAD', 'VULNERABLE', '취약'].includes(value)) return '취약';
  if (['INFO', 'MANUAL', '수동', '재확인', '점검불가', 'N/A', 'NA', '예외'].includes(value)) {
    return '예외';
  }

  return '예외';
}

function inferActionStatus(resultStatus, inspectionStatus) {
  if (inspectionStatus !== '점검완료') return '해당없음';
  return resultStatus === '취약' ? '조치계획' : '해당없음';
}

function extractHostname(content, fileName = '') {
  const patterns = [
    /<<\s*hostname\s*>>\s*([\s\S]*?)(?:\n\s*\n|<<|$)/i,
    /\[hostname\]\s*([\s\S]*?)\s*\[\/hostname\]/i,
    /<hostname>\s*([^<]+)\s*<\/hostname>/i,
  ];

  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match?.[1]) {
      return match[1].trim().split('\n')[0].trim();
    }
  }

  const nameParts = fileName.replace(/\.[^.]+$/, '').split('_');
  for (const part of nameParts) {
    if (part && !/^\d{4}$/.test(part) && !/^\d+\.\d+\.\d+\.\d+$/.test(part)) {
      return part;
    }
  }

  return '';
}

function extractIp(content, fileName = '') {
  const bodyMatch = content.match(/\b(?!(?:127|0)\.)((?:\d{1,3}\.){3}\d{1,3})\b/);
  if (bodyMatch?.[1]) return bodyMatch[1];

  const fileMatch = fileName.match(/\b((?:\d{1,3}\.){3}\d{1,3})\b/);
  if (fileMatch?.[1]) return fileMatch[1];

  return '';
}

function extractCheckResults(content) {
  const results = [];

  const txtBlockRegex =
    /\[ID\]\s*:?\s*([A-Z]{1,20}-\d{2})[\s\S]*?\[Result\]\s*:?\s*([A-Za-z가-힣/]+)[\s\S]*?\[Comment\]\s*:?\s*([\s\S]*?)(?:\n\s*\[Check\]\s*:?\s*([\s\S]*?))?(?=\n={5,}|\n\s*\[ID\]\s*:|^\[End\]|\Z)/gim;

  let match;
  while ((match = txtBlockRegex.exec(content)) !== null) {
    results.push({
      item_code: match[1]?.trim() || '',
      raw_result: match[2]?.trim() || 'Info',
      comment: match[3]?.trim() || '',
      check: (match[4] || '').trim(),
    });
  }

  const xmlBlockRegex = /<([A-Z]{1,20}-\d{2})>([\s\S]*?)<\/\1>/gim;

  while ((match = xmlBlockRegex.exec(content)) !== null) {
    const itemCode = match[1]?.trim() || '';
    const block = match[2] || '';

    const resultMatch = block.match(/<Result>\s*([^<]+)\s*<\/Result>/i);
    const commentMatch = block.match(/<Comment>\s*([\s\S]*?)\s*<\/Comment>/i);
    const checkMatch = block.match(/\[Check\]\s*:?\s*([\s\S]*?)(?=\n={5,}|\Z)/i);

    results.push({
      item_code: itemCode,
      raw_result: resultMatch?.[1]?.trim() || 'Info',
      comment: commentMatch?.[1]?.trim() || '',
      check: checkMatch?.[1]?.trim() || '',
    });
  }

  const dedupMap = new Map();
  for (const row of results) {
    const key = normalizeCodeKey(row.item_code);
    if (!key) continue;
    dedupMap.set(key, row);
  }

  return Array.from(dedupMap.values());
}

function InspectionDetailInline({ row, onSave, saving, locked = false }) {
  const [resultStatus, setResultStatus] = useState(row.result_status || '양호');
  const [checkedAt, setCheckedAt] = useState(
    row.checked_at ? String(row.checked_at).slice(0, 10) : new Date().toISOString().slice(0, 10)
  );
  const [resultDetail, setResultDetail] = useState(row.result_text || '');
  const [reviewedBy, setReviewedBy] = useState(row.reviewed_by || '');

  useEffect(() => {
    setResultStatus(row.result_status || '양호');
    setCheckedAt(
      row.checked_at ? String(row.checked_at).slice(0, 10) : new Date().toISOString().slice(0, 10)
    );
    setResultDetail(row.result_text || '');
    setReviewedBy(row.reviewed_by || '');
  }, [row]);

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="mb-1 text-xs font-medium text-slate-500">점검 항목명</div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800">
            {row.item_name || '-'}
          </div>
        </div>

        <div>
          <div className="mb-1 text-xs font-medium text-slate-500">판정 결과</div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
            <Badge value={row.result_status} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="mb-1 text-xs font-medium text-slate-500">판정 기준</div>
          <textarea
            value={row.criteria || ''}
            readOnly
            rows={10}
            wrap="off"
            className="w-full overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-[11px] leading-5 whitespace-pre outline-none"
          />
        </div>

        <div>
          <div className="mb-1 text-xs font-medium text-slate-500">현황</div>
          <textarea
            value={resultDetail}
            onChange={(e) => setResultDetail(e.target.value)}
            rows={10}
            wrap="off"
            className="w-full overflow-x-auto rounded-lg border border-slate-200 px-3 py-2 font-mono text-[11px] leading-5 whitespace-pre outline-none"
          />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div>
          <div className="mb-1 text-xs font-medium text-slate-500">판정 결과 변경</div>
          <select
            value={resultStatus}
            onChange={(e) => setResultStatus(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none"
          >
            {RESULT_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>

        <div>
          <div className="mb-1 text-xs font-medium text-slate-500">검토일</div>
          <input
            type="date"
            value={checkedAt}
            onChange={(e) => setCheckedAt(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none"
          />
        </div>

        <div>
          <div className="mb-1 text-xs font-medium text-slate-500">검토자</div>
          <input
            value={reviewedBy}
            onChange={(e) => setReviewedBy(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none"
            placeholder="검토자 입력"
          />
        </div>

        <div className="flex items-end">
          <button
            onClick={() =>
              onSave({
                ...row,
                result_status: resultStatus,
                checked_at: checkedAt,
                result_text: resultDetail,
                reviewed_by: reviewedBy,
              })
            }
            disabled={saving || locked}
            className="w-full rounded-lg bg-slate-950 px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            {locked ? '확정 완료' : saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}

function FragmentRow({ row, expanded, onToggle, onSave, saving, locked = false }) {
  return (
    <>
      <tr
        onClick={onToggle}
        className={`border-t border-slate-100 ${
          locked ? 'cursor-default' : 'cursor-pointer hover:bg-slate-50'
        }`}
      >
        <td className="px-3 py-2 text-center font-medium whitespace-nowrap">{row.asset_code}</td>
        <td className="px-3 py-2 text-center whitespace-nowrap">
          {TYPE_LABELS[row.asset_type] || row.asset_type || '-'}
        </td>
        <td className="px-3 py-2 text-center whitespace-nowrap">{row.item_code}</td>
        <td className="px-3 py-2 text-center whitespace-nowrap">
          <Badge value={row.risk_level} />
        </td>
        <td className="px-3 py-2 text-center whitespace-nowrap">
          <Badge value={row.result_status} />
        </td>
        <td className="px-3 py-2 text-center whitespace-nowrap">
          <Badge value={row.inspection_status || '점검전'} />
        </td>
        <td className="px-3 py-2 text-center whitespace-nowrap">
          <Badge value={inferActionStatus(row.result_status, row.inspection_status)} />
        </td>
        <td className="px-3 py-2 text-center whitespace-nowrap">
          {row.checked_at ? String(row.checked_at).slice(0, 10) : '-'}
        </td>
        <td className="px-3 py-2 text-center whitespace-nowrap">
          {row.updated_at ? String(row.updated_at).slice(0, 16).replace('T', ' ') : '-'}
        </td>
      </tr>

      {expanded ? (
        <tr className="border-t border-slate-100 bg-slate-50">
          <td colSpan={9} className="px-4 py-4">
            <InspectionDetailInline row={row} onSave={onSave} saving={saving} locked={locked} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

export default function InspectionPage({
  inspectionResultConfirmed = false,
  canEdit = true,
  canConfirm = false,
  onConfirmInspectionResults,
  onCancelInspectionResultsConfirmation,
}) {
  const [results, setResults] = useState([]);
  const [targets, setTargets] = useState([]);
  const [checklists, setChecklists] = useState([]);

  const [keyword, setKeyword] = useState('');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);

  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [currentPage, setCurrentPage] = useState(1);
  const [expandedRowKey, setExpandedRowKey] = useState(null);
  const [confirmWord, setConfirmWord] = useState('');
  const [confirmInput, setConfirmInput] = useState('');
  const [confirmError, setConfirmError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [cancelingConfirmation, setCancelingConfirmation] = useState(false);

  const fileInputRef = useRef(null);

  useEffect(() => {
    if (inspectionResultConfirmed) return;

    const nextWord =
      CONFIRM_WORD_POOL[Math.floor(Math.random() * CONFIRM_WORD_POOL.length)] +
      '-' +
      String(Math.floor(1000 + Math.random() * 9000));

    setConfirmWord(nextWord);
    setConfirmInput('');
    setConfirmError('');
  }, [inspectionResultConfirmed]);

  useEffect(() => {
    async function init() {
      try {
        setLoading(true);
        setError('');
        await Promise.all([fetchInspectionResults(), fetchTargets(), fetchChecklists()]);
      } catch (err) {
        console.error(err);
        setError(err.message || '점검 결과 조회 실패');
      } finally {
        setLoading(false);
      }
    }

    init();
  }, []);

  async function handleConfirmInspectionResultsClick() {
    if (!canConfirm) {
      setConfirmError('현재 권한으로는 점검 결과를 확정할 수 없습니다.');
      return;
    }

    setMessage('');
    setError('');
    setConfirmError('');

    if (!results.length) {
      setConfirmError('확정할 점검 결과가 없습니다.');
      return;
    }

    if (confirmInput.trim() !== confirmWord) {
      setConfirmError('확인키가 일치하지 않습니다.');
      return;
    }

    try {
      setConfirming(true);
      await onConfirmInspectionResults?.();
      setMessage('점검 결과가 확정되었습니다. 취약점 관리가 활성화되었습니다.');
    } catch (err) {
      console.error(err);
      setConfirmError(err.message || '점검 결과 확정 실패');
    } finally {
      setConfirming(false);
    }
  }

  async function handleCancelInspectionResultsClick() {
    if (!canConfirm) {
      setError('현재 권한으로는 점검 결과 확정을 취소할 수 없습니다.');
      return;
    }

    try {
      setCancelingConfirmation(true);
      setMessage('');
      setError('');
      setConfirmError('');
      await onCancelInspectionResultsConfirmation?.();
      setMessage('점검 결과 확정이 취소되었습니다.');
    } catch (err) {
      console.error(err);
      setError(err.message || '점검 결과 확정 취소 실패');
    } finally {
      setCancelingConfirmation(false);
    }
  }

  useEffect(() => {
    setCurrentPage(1);
  }, [searchKeyword, typeFilter]);

  const normalizedChecklists = useMemo(
    () => (checklists || []).map((row) => normalizeChecklistRow(row)),
    [checklists]
  );

  const resultMap = useMemo(() => {
    const map = {};
    (results || []).forEach((row) => {
      const key = `${row.target_id}-${row.item_id}`;
      map[key] = row;
    });
    return map;
  }, [results]);

  const allRows = useMemo(() => {
    const merged = [];

    targets.forEach((target) => {
      const matchedChecklists = normalizedChecklists.filter((check) =>
        typeMatchesChecklist(target.asset_type, check)
      );

      matchedChecklists.forEach((check) => {
        const key = `${target.id}-${check.id}`;
        const saved = resultMap[key];
        const inspectionStatus = saved?.inspection_status || '점검전';
        const resultStatus = saved?.result_status || '양호';

        merged.push({
          row_key: key,
          id: saved?.id ?? null,
          target_id: target.id,
          item_id: check.id,
          asset_id: saved?.asset_id ?? target.asset_id ?? null,
          asset_code: saved?.asset_code || target.asset_code || '',
          asset_type: saved?.asset_type || target.asset_type || '',
          hostname: target.hostname || '',
          ip_address: target.ip_address || '',
          item_code: saved?.item_code || check.normalized_item_code || '',
          item_name: saved?.item_name || check.normalized_item_name || '',
          criteria: saved?.check_text || check.normalized_criteria || '',
          risk_level: saved?.risk_level || check.normalized_risk_level || '중',
          result_status: resultStatus,
          inspection_status: inspectionStatus,
          action_status:
            saved?.action_status || inferActionStatus(resultStatus, inspectionStatus),
          checked_at: saved?.checked_at || '',
          reviewed_by: saved?.reviewed_by || '',
          result_text: saved?.result_text || '',
          raw_result: saved?.raw_result || '',
          updated_at: saved?.updated_at || null,
          has_saved_result: !!saved?.id,
        });
      });
    });

    return merged;
  }, [targets, normalizedChecklists, resultMap]);

  const filteredRows = useMemo(() => {
    const q = searchKeyword.trim().toLowerCase();

    return allRows.filter((row) => {
      const typeMatched = typeFilter === 'ALL' || row.asset_type === typeFilter;
      if (!typeMatched) return false;

      if (!q) return true;

      return [
        row.asset_code,
        row.hostname,
        row.ip_address,
        row.item_code,
        row.item_name,
        row.result_status,
        row.inspection_status,
        row.result_text,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [allRows, searchKeyword, typeFilter]);

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

  async function insertSecurityAuditLog(action, targetId, detail) {
    try {
      const { data: authData } = await supabase.auth.getUser();
      const actorEmail = authData?.user?.email || 'unknown';

      await runSupabaseMutation(async () => {
        const { error } = await supabase.from('security_audit_logs').insert({
          actor_email: actorEmail,
          action,
          target_type: 'inspection_result',
          target_id: targetId ? String(targetId) : null,
          detail,
        });

        if (error) throw error;
      });
    } catch (err) {
      console.error('security_audit_logs insert 예외:', err);
    }
  }

  async function fetchInspectionResults() {
    const { data, error } = await supabase
      .from('inspection_results')
      .select(
        'id, target_id, item_id, asset_id, asset_code, asset_type, item_code, item_name, risk_level, result_status, result_text, raw_result, check_text, checked_at, inspection_status, action_status, reviewed_by, updated_at'
      )
      .order('updated_at', { ascending: false });

    if (error) throw error;
    setResults(data || []);
  }

  async function fetchTargets() {
    const { data, error } = await supabase
      .from('inspection_targets')
      .select('id, asset_id, asset_code, asset_type, hostname, ip_address, location')
      .in('target_status', ['선정', '점검완료'])
      .order('selected_at', { ascending: false });

    if (error) throw error;
    setTargets(data || []);
  }

  async function fetchChecklists() {
    const { data, error } = await supabase
      .from('check_items')
      .select(
        'id, asset_type, item_code, source_item_code, item_name, check_criteria, description, risk_level'
      )
      .eq('use_yn', '사용')
      .order('item_code', { ascending: true });

    if (error) throw error;
    setChecklists(data || []);
  }

  async function handleInlineSave(row) {
    try {
      if (inspectionResultConfirmed) {
        throw new Error('점검 결과 확정 후에는 저장할 수 없습니다.');
      }

      if (!canEdit) {
        throw new Error('현재 권한으로는 점검 결과를 저장할 수 없습니다.');
      }

      setSaving(true);
      setMessage('');
      setError('');

      const payload = {
        target_id: Number(row.target_id),
        item_id: Number(row.item_id),
        asset_id: row.asset_id ? Number(row.asset_id) : null,
        asset_code: row.asset_code,
        asset_type: row.asset_type,
        item_code: row.item_code,
        item_name: row.item_name || '',
        risk_level: row.risk_level,
        check_method: '수동',
        result_status: row.result_status,
        result_text: row.result_text || '',
        raw_result: row.result_status,
        check_text: row.criteria || '',
        checked_at: row.checked_at || null,
        inspection_status: '점검완료',
        action_status: inferActionStatus(row.result_status, '점검완료'),
        reviewed_by: row.reviewed_by || null,
        updated_at: new Date().toISOString(),
      };

      if (row.id) {
        await runSupabaseMutation(async () => {
          const { error } = await supabase
            .from('inspection_results')
            .update(payload)
            .eq('id', row.id);

          if (error) throw error;
        });

        await insertSecurityAuditLog('update_inspection_result', row.id, {
          asset_code: payload.asset_code,
          item_code: payload.item_code,
          result_status: payload.result_status,
          inspection_status: payload.inspection_status,
        });
      } else {
        const data = await runSupabaseMutation(async () => {
          const { data: insertedData, error } = await supabase
            .from('inspection_results')
            .insert(payload)
            .select('id')
            .single();

          if (error) throw error;
          return insertedData;
        });

        await insertSecurityAuditLog('create_inspection_result', data?.id, {
          asset_code: payload.asset_code,
          item_code: payload.item_code,
          result_status: payload.result_status,
          inspection_status: payload.inspection_status,
        });
      }

      await fetchInspectionResults();
      setMessage('점검 결과가 저장되었습니다.');
    } catch (err) {
      console.error(err);
      setError(err.message || '점검 결과 저장 실패');
    } finally {
      setSaving(false);
    }
  }

  async function handleImportScriptResults(event) {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    try {
      if (inspectionResultConfirmed) {
        throw new Error('점검 결과 확정 후에는 스크립트 Import를 할 수 없습니다.');
      }

      if (!canEdit) {
        throw new Error('현재 권한으로는 스크립트 결과를 Import할 수 없습니다.');
      }

      setImporting(true);
      setMessage('');
      setError('');

      let processedCount = 0;
      let skippedNoTarget = 0;
      let skippedNoChecklist = 0;
      let skippedNoParsed = 0;
      const auditSummaries = [];

      for (const file of files) {
        const content = await file.text();
        const fileName = file.name || '';

        const hostname = extractHostname(content, fileName);
        const ipAddress = extractIp(content, fileName);
        const parsedResults = extractCheckResults(content);

        if (parsedResults.length === 0) {
          skippedNoParsed += 1;
          continue;
        }

        const matchedTarget =
          targets.find((target) => {
            return (
              (hostname && String(target.hostname || '').trim() === hostname) ||
              (ipAddress && String(target.ip_address || '').trim() === ipAddress)
            );
          }) ||
          targets.find((target) => hostname && String(target.asset_code || '').trim() === hostname);

        if (!matchedTarget) {
          skippedNoTarget += 1;
          continue;
        }

        for (const parsed of parsedResults) {
          const matchedChecklist = normalizedChecklists.find((item) => {
            return (
              codesMatch(item.normalized_item_code, parsed.item_code) &&
              typeMatchesChecklist(matchedTarget.asset_type, item)
            );
          });

          if (!matchedChecklist) {
            skippedNoChecklist += 1;
            continue;
          }

          const resultStatus = normalizeScriptResult(parsed.raw_result);

          const payload = {
            target_id: matchedTarget.id,
            item_id: matchedChecklist.id,
            asset_id: matchedTarget.asset_id ?? null,
            asset_code: matchedTarget.asset_code || '',
            asset_type: matchedTarget.asset_type || '',
            item_code: matchedChecklist.normalized_item_code || parsed.item_code,
            item_name: matchedChecklist.normalized_item_name || '',
            risk_level: matchedChecklist.normalized_risk_level || '중',
            check_method: '자동',
            result_status: resultStatus,
            result_text: parsed.comment || '',
            raw_result: parsed.raw_result || '',
            check_text: parsed.check || matchedChecklist.normalized_criteria || '',
            checked_at: new Date().toISOString().slice(0, 10),
            inspection_status: '점검전',
            action_status: '해당없음',
            updated_at: new Date().toISOString(),
          };

          const existingRow = await runSupabaseMutation(async () => {
            const { data, error: existingError } = await supabase
              .from('inspection_results')
              .select('id')
              .eq('target_id', payload.target_id)
              .eq('item_id', payload.item_id)
              .maybeSingle();

            if (existingError) throw existingError;
            return data;
          });

          if (existingRow?.id) {
            await runSupabaseMutation(async () => {
              const { error: updateError } = await supabase
                .from('inspection_results')
                .update(payload)
                .eq('id', existingRow.id);

              if (updateError) throw updateError;
            });

            auditSummaries.push({
              action: 'import_script_result_update',
              targetId: existingRow.id,
              file_name: fileName,
              asset_code: payload.asset_code,
              item_code: payload.item_code,
              raw_result: payload.raw_result,
              result_status: payload.result_status,
            });
          } else {
            const insertedRow = await runSupabaseMutation(async () => {
              const { data, error: insertError } = await supabase
                .from('inspection_results')
                .insert(payload)
                .select('id')
                .single();

              if (insertError) throw insertError;
              return data;
            });

            auditSummaries.push({
              action: 'import_script_result_create',
              targetId: insertedRow?.id,
              file_name: fileName,
              asset_code: payload.asset_code,
              item_code: payload.item_code,
              raw_result: payload.raw_result,
              result_status: payload.result_status,
            });
          }

          processedCount += 1;
        }
      }

      await fetchInspectionResults();
      if (auditSummaries.length > 0) {
        const preview = auditSummaries.slice(0, 20).map((entry) => ({
          action: entry.action,
          target_id: entry.targetId ? String(entry.targetId) : null,
          file_name: entry.file_name,
          asset_code: entry.asset_code,
          item_code: entry.item_code,
          result_status: entry.result_status,
        }));

        await insertSecurityAuditLog('import_script_result_batch', null, {
          processed_count: processedCount,
          skipped_no_parsed: skippedNoParsed,
          skipped_no_target: skippedNoTarget,
          skipped_no_checklist: skippedNoChecklist,
          preview,
        });
      }
      setMessage(
        `스크립트 결과 ${processedCount}건 반영, 파싱실패 ${skippedNoParsed}건, 자산매칭실패 ${skippedNoTarget}건, 기준매칭실패 ${skippedNoChecklist}건`
      );
    } catch (err) {
      console.error(err);
      setError(err.message || '스크립트 결과 Import 실패');
    } finally {
      setImporting(false);
      event.target.value = '';
    }
  }

  const kpis = useMemo(() => {
    const targetCount = targets.length;
    const totalItemCount = allRows.length;

    const registeredTargetCount = new Set(
      allRows.filter((row) => row.has_saved_result).map((row) => row.target_id)
    ).size;

    const vulnerableCount = allRows.filter((row) => row.result_status === '취약').length;
    const completedCount = allRows.filter((row) => row.inspection_status === '점검완료').length;

    const registeredRatio =
      targetCount > 0 ? `${Math.round((registeredTargetCount / targetCount) * 100)}%` : '0%';
    const vulnerableRatio =
      totalItemCount > 0 ? `${Math.round((vulnerableCount / totalItemCount) * 100)}%` : '0%';
    const completedRatio =
      totalItemCount > 0 ? `${Math.round((completedCount / totalItemCount) * 100)}%` : '0%';

    return [
      { title: '점검대상 수', value: targetCount, sub: '선정된 점검 대상 자산 수' },
      {
        title: '점검 대상 수 대비 등록 수',
        value: registeredRatio,
        sub: `${registeredTargetCount}/${targetCount}`,
      },
      {
        title: '전체 항목 수 대비 취약 비율',
        value: vulnerableRatio,
        sub: `${vulnerableCount}/${totalItemCount}`,
      },
      {
        title: '전체 항목 수 대비 점검완료율',
        value: completedRatio,
        sub: `${completedCount}/${totalItemCount}`,
      },
    ];
  }, [targets, allRows]);

  return (
    <div className="space-y-4">
      <Card className={inspectionResultConfirmed ? 'border-emerald-300 bg-emerald-50/70' : 'border-slate-700 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-700'}>
        <div className="flex min-h-[72px] w-full flex-col gap-2 px-5 py-2.5 lg:flex-row lg:items-center lg:justify-between">
          <div className="w-full lg:flex-1">
            <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-xs ${inspectionResultConfirmed ? 'text-slate-600' : 'text-slate-200'}`}>
              <span>점검 결과 검토가 끝났다면 확인키를 입력해 확정하세요.</span>
              {inspectionResultConfirmed ? (
                <span className="text-xs font-semibold text-slate-900">확정 완료</span>
              ) : (
                <span className="inline-flex items-center rounded-md bg-white/12 px-2 py-0.5 text-[11px] font-semibold text-white ring-1 ring-inset ring-white/10">
                  확인키: <span className="ml-1 font-bold text-rose-400">{confirmWord || '-'}</span>
                </span>
              )}
            </div>
          </div>

          {inspectionResultConfirmed ? (
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-end lg:w-auto">
              <div className="inline-flex h-8 items-center rounded-lg border border-emerald-300 bg-white px-3 text-xs font-medium text-emerald-700">
                점검 결과 확정 완료
              </div>
              <button
                onClick={handleCancelInspectionResultsClick}
                disabled={cancelingConfirmation || !canConfirm}
                className="inline-flex h-8 items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700"
              >
                {cancelingConfirmation ? '취소 중...' : '점검 결과 확정 취소'}
              </button>
            </div>
          ) : !canConfirm ? (
            <div className="inline-flex h-8 items-center rounded-lg border border-white/15 bg-white/10 px-3 text-xs font-medium text-slate-200">
              확정 권한 없음
            </div>
          ) : (
            <div className="flex w-full flex-col gap-2 text-right lg:flex-1 lg:items-end">
              <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                <input
                  value={confirmInput}
                  onChange={(e) => setConfirmInput(e.target.value)}
                  disabled={confirming || !canConfirm}
                  className="h-8 w-full rounded-lg border border-white/15 bg-white/95 px-3 text-xs text-slate-900 outline-none sm:max-w-[240px]"
                  placeholder="확인키를 정확히 입력하세요"
                />
                <button
                  onClick={handleConfirmInspectionResultsClick}
                  disabled={confirming || !canConfirm}
                  className="inline-flex h-8 items-center rounded-lg bg-white px-3 text-xs font-semibold text-slate-900 sm:w-auto"
                >
                  {confirming ? '확정 중...' : '점검 결과 확정'}
                </button>
              </div>
              {confirmError ? <div className="text-xs text-rose-600">{confirmError}</div> : null}
            </div>
          )}
        </div>
      </Card>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((item) => (
          <Card key={item.title} className="flex min-h-[112px] w-full flex-col justify-between rounded-2xl p-4">
            <div className="text-[11px] font-semibold text-slate-500">{item.title}</div>
            <div className="mt-2 text-[28px] font-bold tracking-tight text-slate-900">{item.value}</div>
            <div className="mt-1 text-[11px] leading-4 text-slate-500">{item.sub}</div>
          </Card>
        ))}
      </section>

      <Card className="overflow-hidden">
        <SectionHeader
          title="취약점 점검 결과 등록"
          desc="점검 대상별 전체 점검 항목을 검토하고 결과를 저장합니다."
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
                  placeholder="자산코드, 항목코드 검색"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none placeholder:text-slate-400 xl:w-[300px]"
                />
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".xml,.txt"
                multiple
                className="hidden"
                onChange={handleImportScriptResults}
              />

              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={importing || inspectionResultConfirmed || !canEdit}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {importing ? 'Import 중...' : '스크립트 결과 Import'}
              </button>
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
          <div className="flex flex-wrap gap-2">
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
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-3 py-2 text-center font-bold whitespace-nowrap">자산코드</th>
                <th className="px-3 py-2 text-center font-bold whitespace-nowrap">구분</th>
                <th className="px-3 py-2 text-center font-bold whitespace-nowrap">항목코드</th>
                <th className="px-3 py-2 text-center font-bold whitespace-nowrap">위험도</th>
                <th className="px-3 py-2 text-center font-bold whitespace-nowrap">판정 결과</th>
                <th className="px-3 py-2 text-center font-bold whitespace-nowrap">점검 상태</th>
                <th className="px-3 py-2 text-center font-bold whitespace-nowrap">조치 상태</th>
                <th className="px-3 py-2 text-center font-bold whitespace-nowrap">점검일</th>
                <th className="px-3 py-2 text-center font-bold whitespace-nowrap">수정일</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-slate-400">
                    점검 결과를 불러오는 중입니다.
                  </td>
                </tr>
              ) : pagedRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-slate-400">
                    표시할 점검 결과가 없습니다.
                  </td>
                </tr>
              ) : (
                pagedRows.map((row) => (
                  <FragmentRow
                    key={row.row_key}
                    row={row}
                    expanded={expandedRowKey === row.row_key}
                    onToggle={() =>
                      setExpandedRowKey((prev) => (prev === row.row_key ? null : row.row_key))
                    }
                    onSave={handleInlineSave}
                    saving={saving}
                    locked={inspectionResultConfirmed || !canEdit}
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
