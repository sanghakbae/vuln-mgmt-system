//정보자산 관리
//AssetsPage.jsx
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { exportAssetsWorkbook, parseAssetsWorkbook } from '../utils/assetsWorkbook';
import { chunkArray, runSupabaseMutation } from '../utils/supabaseMutation';
import { ASSET_SELECT_COLUMNS } from '../services/assetsService';

const PAGE_SIZE = 25;
const ASSETS_CACHE_KEY = 'assets-page-cache';

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

const EMPTY_FORM = {
  id: null,
  asset_code: '',
  asset_type: 'SERVER',
  hostname: '',
  ip_address: '',
  os_version: '',
  related_service: '',
  purpose: '',
  location: '',
  department: '',
  owner_name: '',
  manager_name: '',
  confidentiality: 1,
  integrity: 1,
  availability: 1,
  criticality_score: 3,
  criticality_grade: '하',
  status: '운영',
};

const assetImportRules = [
  { type: 'SERVER 시트', action: 'SERVER 자산 저장', key: 'SRV-XXX 자동 생성' },
  { type: 'DATABASE 시트', action: 'DATABASE 자산 저장', key: 'DB-XXX 자동 생성' },
  { type: 'WEB_APP 시트', action: 'WEB_APP 자산 저장', key: 'WEB-XXX 자동 생성' },
  { type: 'WAS 시트', action: 'WAS 자산 저장', key: 'WAS-XXX 자동 생성' },
  { type: 'NETWORK 시트', action: 'NETWORK 자산 저장', key: 'NW-XXX 자동 생성' },
  { type: 'SECURITY 시트', action: 'SECURITY 자산 저장', key: 'SEC-XXX 자동 생성' },
  { type: 'ETC 시트', action: 'ETC 자산 저장', key: 'ETC-XXX 자동 생성' },
];

const ASSET_CODE_TYPE_PREFIXES = [
  ['SRV', 'SERVER'],
  ['DB', 'DATABASE'],
  ['WEB', 'WEB_APP'],
  ['WAS', 'WAS'],
  ['NW', 'NETWORK'],
  ['SEC', 'SECURITY'],
  ['ETC', 'ETC'],
];

const CONFIRM_WORD_POOL = [
  'LOCK',
  'ASSET',
  'TARGET',
  'VERIFY',
  'COMMIT',
  'CONTROL',
  'SHIELD',
  'GATE',
];

function inferAssetType(row) {
  const explicitType = String(row?.asset_type || '').trim().toUpperCase();
  if (explicitType) return explicitType;

  const code = String(row?.asset_code || '').trim().toUpperCase();
  const matchedPrefix = ASSET_CODE_TYPE_PREFIXES.find(([prefix]) => code.startsWith(`${prefix}-`));

  return matchedPrefix?.[1] || 'ETC';
}

function normalizeAssetRow(row) {
  const confidentiality = Number(row?.confidentiality ?? 1);
  const integrity = Number(row?.integrity ?? 1);
  const availability = Number(row?.availability ?? 1);
  const computed = calcCriticality(confidentiality, integrity, availability);

  return {
    ...row,
    asset_type: inferAssetType(row),
    confidentiality,
    integrity,
    availability,
    criticality_score: Number(row?.criticality_score ?? computed.score),
    criticality_grade: row?.criticality_grade || computed.grade,
    status: row?.status || '운영',
  };
}

async function selectAssetsWithFallback() {
  const attempts = [
    () => supabase.from('assets').select(ASSET_SELECT_COLUMNS).order('updated_at', { ascending: false }),
    () => supabase.from('assets').select(ASSET_SELECT_COLUMNS).order('asset_code', { ascending: true }),
    () => supabase.from('assets').select(ASSET_SELECT_COLUMNS),
  ];

  let lastError = null;

  for (const run of attempts) {
    const { data, error } = await run();
    if (!error) return data || [];
    lastError = error;
  }

  throw lastError;
}

function calcCriticality(confidentiality, integrity, availability) {
  const score = Number(confidentiality) + Number(integrity) + Number(availability);
  let grade = '하';
  if (score >= 8) grade = '상';
  else if (score >= 5) grade = '중';
  return { score, grade };
}

function readAssetsCache() {
  if (typeof window === 'undefined') {
    return { rows: [], rawCount: null };
  }

  try {
    const cached = window.localStorage.getItem(ASSETS_CACHE_KEY);
    if (!cached) return { rows: [], rawCount: null };

    const parsed = JSON.parse(cached);
    if (!Array.isArray(parsed?.rows)) {
      return { rows: [], rawCount: null };
    }

    const normalizedRows = parsed.rows.map(normalizeAssetRow);

    return {
      rows: normalizedRows,
      rawCount: Number(parsed.rawCount ?? normalizedRows.length),
    };
  } catch (cacheError) {
    console.error(cacheError);
    return { rows: [], rawCount: null };
  }
}

function writeAssetsCache(rows, rawCount) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(
      ASSETS_CACHE_KEY,
      JSON.stringify({
        rows,
        rawCount,
        updatedAt: Date.now(),
      })
    );
  } catch (cacheError) {
    console.error(cacheError);
  }
}

function Card({ children, className = '' }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {children}
    </div>
  );
}

function Badge({ children }) {
  const badgeMap = {
    상: 'bg-rose-100 text-rose-700',
    중: 'bg-amber-100 text-amber-700',
    하: 'bg-emerald-100 text-emerald-700',
    운영: 'bg-sky-100 text-sky-700',
  };

  return (
    <span
      className={`inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-semibold leading-4 ${
        badgeMap[children] || 'bg-slate-100 text-slate-700'
      }`}
    >
      {children}
    </span>
  );
}

function SectionHeader({ title, desc, action }) {
  return (
    <div className="flex min-h-[88px] flex-col gap-4 border-b border-slate-200 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-h-[56px] flex-col justify-center">
        <div className="text-lg font-semibold">{title}</div>
        <div className="text-xs text-slate-500">{desc}</div>
      </div>
      {action}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="space-y-1">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      {children}
    </label>
  );
}

function AssetEditor({
  open,
  mode,
  form,
  onChange,
  onClose,
  onSave,
  saving,
}) {
  if (!open) return null;

  const editorContent = (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-semibold">
            {mode === 'create' ? '자산 등록' : '자산 편집'}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            자산유형에 따라 자산코드가 자동 생성됩니다.
          </div>
        </div>
        <button
          onClick={onClose}
          className="inline-flex h-8 items-center rounded-lg border border-slate-200 px-3 text-xs text-slate-600"
        >
          닫기
        </button>
      </div>

      <div className="px-5 py-5">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field label="자산코드">
            <input
              value={form.asset_code}
              onChange={(e) => onChange('asset_code', e.target.value)}
              disabled
              className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs outline-none"
              placeholder="자동 생성"
            />
          </Field>

          <Field label="자산유형">
            <select
              value={form.asset_type}
              onChange={(e) => onChange('asset_type', e.target.value)}
              disabled={mode === 'edit'}
              className="h-8 w-full rounded-lg border border-slate-200 px-3 text-xs outline-none disabled:bg-slate-50"
            >
              {TYPE_OPTIONS.filter((item) => item.value !== 'ALL').map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Hostname">
            <input
              value={form.hostname}
              onChange={(e) => onChange('hostname', e.target.value)}
              className="h-8 w-full rounded-lg border border-slate-200 px-3 text-xs outline-none"
            />
          </Field>

          <Field label="IP Address">
            <input
              value={form.ip_address}
              onChange={(e) => onChange('ip_address', e.target.value)}
              className="h-8 w-full rounded-lg border border-slate-200 px-3 text-xs outline-none"
            />
          </Field>

          <Field label="버전">
            <input
              value={form.os_version}
              onChange={(e) => onChange('os_version', e.target.value)}
              className="h-8 w-full rounded-lg border border-slate-200 px-3 text-xs outline-none"
            />
          </Field>

          <Field label="관련 서비스">
            <input
              value={form.related_service}
              onChange={(e) => onChange('related_service', e.target.value)}
              className="h-8 w-full rounded-lg border border-slate-200 px-3 text-xs outline-none"
            />
          </Field>

          <Field label="용도">
            <input
              value={form.purpose}
              onChange={(e) => onChange('purpose', e.target.value)}
              className="h-8 w-full rounded-lg border border-slate-200 px-3 text-xs outline-none"
            />
          </Field>

          <Field label="위치">
            <input
              value={form.location}
              onChange={(e) => onChange('location', e.target.value)}
              className="h-8 w-full rounded-lg border border-slate-200 px-3 text-xs outline-none"
            />
          </Field>

          <Field label="담당부서">
            <input
              value={form.department}
              onChange={(e) => onChange('department', e.target.value)}
              className="h-8 w-full rounded-lg border border-slate-200 px-3 text-xs outline-none"
            />
          </Field>

          <Field label="담당자">
            <input
              value={form.owner_name}
              onChange={(e) => onChange('owner_name', e.target.value)}
              className="h-8 w-full rounded-lg border border-slate-200 px-3 text-xs outline-none"
            />
          </Field>

          <Field label="관리자">
            <input
              value={form.manager_name}
              onChange={(e) => onChange('manager_name', e.target.value)}
              className="h-8 w-full rounded-lg border border-slate-200 px-3 text-xs outline-none"
            />
          </Field>

          <div className="md:col-span-2 xl:col-span-4">
            <div className="grid gap-3 sm:grid-cols-4">
              <Field label="기밀성">
                <select
                  value={form.confidentiality}
                  onChange={(e) => onChange('confidentiality', Number(e.target.value))}
                  className="h-8 w-full rounded-lg border border-slate-200 px-3 text-xs outline-none"
                >
                  {[1, 2, 3].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </Field>

              <Field label="무결성">
                <select
                  value={form.integrity}
                  onChange={(e) => onChange('integrity', Number(e.target.value))}
                  className="h-8 w-full rounded-lg border border-slate-200 px-3 text-xs outline-none"
                >
                  {[1, 2, 3].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </Field>

              <Field label="가용성">
                <select
                  value={form.availability}
                  onChange={(e) => onChange('availability', Number(e.target.value))}
                  className="h-8 w-full rounded-lg border border-slate-200 px-3 text-xs outline-none"
                >
                  {[1, 2, 3].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </Field>

              <Field label="중요도">
                <input
                  value={form.criticality_grade}
                  readOnly
                  className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs outline-none"
                />
              </Field>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
        <button
          onClick={onClose}
          className="inline-flex h-8 items-center rounded-lg border border-slate-200 px-4 text-xs text-slate-600"
        >
          취소
        </button>
        <button
          onClick={onSave}
          disabled={saving}
          className="inline-flex h-8 items-center rounded-lg bg-slate-950 px-4 text-xs font-semibold text-white disabled:opacity-50"
        >
          {saving ? '저장 중...' : '저장'}
        </button>
      </div>
    </Card>
  );

  if (mode === 'create') {
    return (
      <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/40 px-4">
        <div className="w-full max-w-[1100px]">
          {editorContent}
        </div>
      </div>
    );
  }

  return editorContent;
}

export default function AssetsPage({
  assetsConfirmed = false,
  canEdit = true,
  canConfirm = false,
  onConfirmAssets,
  onCancelAssetConfirmation,
}) {
  const [assetRows, setAssetRows] = useState(() => readAssetsCache().rows);
  const [rawAssetCount, setRawAssetCount] = useState(() => readAssetsCache().rawCount);
  const [keyword, setKeyword] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [modalMode, setModalMode] = useState('create');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [currentPage, setCurrentPage] = useState(1);
  const [confirmWord, setConfirmWord] = useState('');
  const [confirmInput, setConfirmInput] = useState('');
  const [confirmError, setConfirmError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [cancelingConfirmation, setCancelingConfirmation] = useState(false);
  const fileInputRef = useRef(null);

  const toneMap = {
    slate: 'border-slate-200 bg-white',
    rose: 'border-rose-200 bg-rose-50/60',
    violet: 'border-violet-200 bg-violet-50/60',
  };

  useEffect(() => {
    if (assetsConfirmed) return;

    const nextWord =
      CONFIRM_WORD_POOL[Math.floor(Math.random() * CONFIRM_WORD_POOL.length)] +
      '-' +
      String(Math.floor(1000 + Math.random() * 9000));

    setConfirmWord(nextWord);
    setConfirmInput('');
    setConfirmError('');
  }, [assetsConfirmed]);

  async function fetchAssets() {
    if (!supabase) {
      throw new Error('Supabase 설정이 없습니다. .env 파일을 확인하세요.');
    }

    const data = await selectAssetsWithFallback();
    const normalizedRows = data.map(normalizeAssetRow);

    setRawAssetCount(data.length);
    setAssetRows(normalizedRows);

    writeAssetsCache(normalizedRows, data.length);
  }

  async function runAssetsDebugProbe() {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    if (!url || !anonKey) {
      return;
    }

    try {
      const response = await fetch(`${url}/rest/v1/assets?select=*&limit=1`, {
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
        },
      });

    } catch (err) {
      console.error('assets debug probe 실패:', err);
    }
  }

  useEffect(() => {
    fetchAssets()
      .catch((err) => {
        console.error(err);
        setError(err.message || '자산 목록 조회 실패');
        runAssetsDebugProbe().catch((probeError) => {
          console.error(probeError);
        });
      });
  }, []);

  const assetKpis = useMemo(() => {
    const total = assetRows.length;
    const high = assetRows.filter((row) => row.criticality_grade === '상').length;
    const today = new Date().toISOString().slice(0, 10);
    const recent = assetRows.filter(
      (row) => String(row.updated_at || row.registered_at || '').slice(0, 10) === today
    ).length;

    return [
      { title: '전체 자산', value: String(total), sub: '등록된 정보자산 수', tone: 'slate' },
      { title: '중요도 상', value: String(high), sub: 'CIA 자동 계산 결과', tone: 'rose' },
      { title: '최근 등록/수정', value: String(recent), sub: '오늘 기준 날짜 업데이트', tone: 'violet' },
    ];
  }, [assetRows]);

  const filteredRows = useMemo(() => {
    const q = keyword.trim().toLowerCase();

    return assetRows.filter((row) => {
      const typeMatched = typeFilter === 'ALL' || row.asset_type === typeFilter;
      if (!typeMatched) return false;

      if (!q) return true;

      const searchableValues = [
        row.asset_code,
        TYPE_OPTIONS.find((item) => item.value === row.asset_type)?.label,
        row.asset_type,
        row.hostname,
        row.ip_address,
        row.os_version,
        row.related_service,
        row.purpose,
        row.location,
        row.department,
        row.owner_name,
        row.manager_name,
        row.criticality_grade,
        row.status,
      ];

      return searchableValues
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [assetRows, keyword, typeFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));

  const pagedRows = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredRows.slice(start, start + PAGE_SIZE);
  }, [filteredRows, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [keyword, typeFilter]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const handleClickImport = () => {
    if (assetsConfirmed || !canEdit) return;
    setMessage('');
    setError('');
    fileInputRef.current?.click();
  };

  const handleImport = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setLoading(true);
      setMessage('');
      setError('');

      if (!supabase) {
        throw new Error('Supabase 설정이 없습니다. .env 파일을 확인하세요.');
      }

      const parsedRows = await parseAssetsWorkbook(file);

      const rowsToSave = parsedRows.map((row) => ({
        asset_code: row.asset_code || undefined,
        asset_type: row.asset_type,
        hostname: row.hostname,
        ip_address: row.ip_address,
        os_version: row.os_version,
        related_service: row.related_service,
        purpose: row.purpose,
        location: row.location,
        department: row.department,
        owner_name: row.owner_name,
        manager_name: row.manager_name,
        confidentiality: row.confidentiality,
        integrity: row.integrity,
        availability: row.availability,
        criticality_score: row.criticality_score,
        criticality_grade: row.criticality_grade,
        status: '운영',
        updated_at: new Date().toISOString(),
      }));

      const rowsWithCode = rowsToSave.filter((row) => row.asset_code);
      const rowsWithoutCode = rowsToSave.filter((row) => !row.asset_code);

      if (rowsWithCode.length > 0) {
        for (const chunk of chunkArray(rowsWithCode, 100)) {
          await runSupabaseMutation(async () => {
            const { error: upsertError } = await supabase
              .from('assets')
              .upsert(chunk, { onConflict: 'asset_code' });

            if (upsertError) throw upsertError;
          });
        }
      }

      if (rowsWithoutCode.length > 0) {
        for (const chunk of chunkArray(rowsWithoutCode, 100)) {
          await runSupabaseMutation(async () => {
            const { error: insertError } = await supabase
              .from('assets')
              .insert(chunk);

            if (insertError) throw insertError;
          });
        }
      }

      await fetchAssets();
      setMessage(
        `${parsedRows.length}건 처리 완료 (신규 ${rowsWithoutCode.length}건, 수정 ${rowsWithCode.length}건)`
      );
    } catch (err) {
      console.error(err);
      setError(err.message || '업로드 실패');
    } finally {
      setLoading(false);
      event.target.value = '';
    }
  };

  const handleExport = () => {
    setMessage('');
    setError('');
    exportAssetsWorkbook(assetRows);
    setMessage('엑셀 Export를 시작했습니다.');
  };

  const openCreateModal = () => {
    if (assetsConfirmed || !canEdit) return;
    setModalMode('create');
    setForm(EMPTY_FORM);
    setEditorOpen(true);
  };

  const openEditModal = (row) => {
    if (assetsConfirmed || !canEdit) return;
    if (editorOpen && modalMode === 'edit' && form.id === row.id) {
      setEditorOpen(false);
      return;
    }
    setModalMode('edit');
    setForm({
      id: row.id ?? null,
      asset_code: row.asset_code ?? '',
      asset_type: row.asset_type ?? 'SERVER',
      hostname: row.hostname ?? '',
      ip_address: row.ip_address ?? '',
      os_version: row.os_version ?? '',
      related_service: row.related_service ?? '',
      purpose: row.purpose ?? '',
      location: row.location ?? '',
      department: row.department ?? '',
      owner_name: row.owner_name ?? '',
      manager_name: row.manager_name ?? '',
      confidentiality: Number(row.confidentiality ?? 1),
      integrity: Number(row.integrity ?? 1),
      availability: Number(row.availability ?? 1),
      criticality_score: Number(row.criticality_score ?? 3),
      criticality_grade: row.criticality_grade ?? '하',
      status: row.status ?? '운영',
    });
    setEditorOpen(true);
  };

  const handleFormChange = (field, value) => {
    const next = { ...form, [field]: value };

    if (['confidentiality', 'integrity', 'availability'].includes(field)) {
      const { score, grade } = calcCriticality(
        next.confidentiality,
        next.integrity,
        next.availability
      );
      next.criticality_score = score;
      next.criticality_grade = grade;
    }

    setForm(next);
  };

  const handleSaveAsset = async () => {
    if (!canEdit) {
      setError('현재 권한으로는 정보자산을 수정할 수 없습니다.');
      return;
    }

    if (assetsConfirmed) {
      setError('정보자산이 확정되어 수정할 수 없습니다.');
      return;
    }

    try {
      setSaving(true);
      setMessage('');
      setError('');

      if (!supabase) {
        throw new Error('Supabase 설정이 없습니다. .env 파일을 확인하세요.');
      }

      const payload = {
        asset_type: form.asset_type,
        hostname: form.hostname,
        ip_address: form.ip_address,
        os_version: form.os_version,
        related_service: form.related_service,
        purpose: form.purpose,
        location: form.location,
        department: form.department,
        owner_name: form.owner_name,
        manager_name: form.manager_name,
        confidentiality: Number(form.confidentiality),
        integrity: Number(form.integrity),
        availability: Number(form.availability),
        criticality_score: Number(form.criticality_score),
        criticality_grade: form.criticality_grade,
        status: form.status || '운영',
        updated_at: new Date().toISOString(),
      };

      if (modalMode === 'create') {
        if (form.asset_code?.trim()) {
          payload.asset_code = form.asset_code.trim();

          await runSupabaseMutation(async () => {
            const { error: upsertError } = await supabase
              .from('assets')
              .upsert(payload, { onConflict: 'asset_code' });

            if (upsertError) throw upsertError;
          });
        } else {
          await runSupabaseMutation(async () => {
            const { error: insertError } = await supabase
              .from('assets')
              .insert(payload);

            if (insertError) throw insertError;
          });
        }

        setMessage('자산이 등록되었습니다.');
      } else {
        await runSupabaseMutation(async () => {
          const { error: updateError } = await supabase
            .from('assets')
            .update(payload)
            .eq('id', form.id);

          if (updateError) throw updateError;
        });
        setMessage('자산이 수정되었습니다.');
      }

      setEditorOpen(false);
      await fetchAssets();
    } catch (err) {
      console.error(err);
      setError(err.message || '자산 저장 실패');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmAssets = async () => {
    if (!canConfirm) {
      setConfirmError('현재 권한으로는 정보자산을 확정할 수 없습니다.');
      return;
    }

    if (assetsConfirmed) return;

    setMessage('');
    setError('');
    setConfirmError('');

    if (!assetRows.length) {
      setConfirmError('확정할 정보자산이 없습니다.');
      return;
    }

    if (confirmInput.trim() !== confirmWord) {
      setConfirmError('확인키가 일치하지 않습니다.');
      return;
    }

    try {
      setConfirming(true);
      await onConfirmAssets?.();
      setMessage('정보자산이 확정되었습니다. 점검 대상 관리가 활성화되었습니다.');
    } catch (err) {
      console.error(err);
      setConfirmError(err.message || '정보자산 확정 실패');
    } finally {
      setConfirming(false);
    }
  };

  async function handleCancelConfirmation() {
    if (!canConfirm) {
      setError('현재 권한으로는 정보자산 확정을 취소할 수 없습니다.');
      return;
    }

    try {
      setCancelingConfirmation(true);
      setMessage('');
      setError('');
      setConfirmError('');
      await onCancelAssetConfirmation?.();
      setMessage('정보자산 확정이 취소되었습니다.');
    } catch (err) {
      console.error(err);
      setError(err.message || '정보자산 확정 취소 실패');
    } finally {
      setCancelingConfirmation(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className={assetsConfirmed ? 'border-emerald-300 bg-emerald-50/70' : 'border-slate-700 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-700'}>
        <div className="flex min-h-[72px] w-full flex-col gap-2 px-5 py-2.5 lg:flex-row lg:items-center lg:justify-between">
          <div className="w-full lg:flex-1">
            <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-xs ${assetsConfirmed ? 'text-slate-600' : 'text-slate-200'}`}>
              <span>자산 등록과 검토가 끝났다면 확인키를 입력해 확정하세요.</span>
              {assetsConfirmed ? (
                <span className="text-xs font-semibold text-slate-900">확정 완료</span>
              ) : (
                <span className="inline-flex items-center rounded-md bg-white/12 px-2 py-0.5 text-[11px] font-semibold text-white ring-1 ring-inset ring-white/10">
                  확인키: <span className="ml-1 font-bold text-rose-400">{confirmWord || '-'}</span>
                </span>
              )}
            </div>
          </div>

          {assetsConfirmed ? (
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-end lg:w-auto">
              <div className="inline-flex h-8 items-center rounded-lg border border-emerald-300 bg-white px-3 text-xs font-medium text-emerald-700">
                정보자산 확정 완료
              </div>
              <button
                onClick={handleCancelConfirmation}
                disabled={cancelingConfirmation || !canConfirm}
                className="inline-flex h-8 items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700"
              >
                {cancelingConfirmation ? '취소 중...' : '정보자산 확정 취소'}
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
                  onClick={handleConfirmAssets}
                  disabled={confirming || !canConfirm}
                  className="inline-flex h-8 items-center rounded-lg bg-white px-3 text-xs font-semibold text-slate-900 sm:w-auto"
                >
                  {confirming ? '확정 중...' : '정보자산 확정'}
                </button>
              </div>
              {confirmError ? (
                <div className="text-xs text-rose-600">{confirmError}</div>
              ) : null}
            </div>
          )}
        </div>
      </Card>

      <section className="grid grid-cols-3 gap-3">
        {assetKpis.map((item) => (
          <Card
            key={item.title}
            className={`flex min-h-[112px] w-full flex-col justify-between rounded-2xl p-4 ${toneMap[item.tone]}`}
          >
            <div className="text-[11px] font-semibold text-slate-500">{item.title}</div>
            <div className="mt-2 text-[28px] font-bold tracking-tight text-slate-900">{item.value}</div>
            <div className="mt-1 text-[11px] leading-4 text-slate-500">{item.sub}</div>
          </Card>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-1">
        <Card className="overflow-hidden">
          <SectionHeader
            title="정보자산 목록"
            desc="시트 이름 기준으로 자산유형을 구분하여 DB에 저장하고, 상단 필터로 조회합니다."
            action={
              <div className="flex flex-wrap items-center gap-1.5">
                <input
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs outline-none placeholder:text-slate-400"
                  placeholder="자산코드, Hostname, IP"
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={handleImport}
                />
                <button
                  onClick={handleClickImport}
                  disabled={loading || assetsConfirmed || !canEdit}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 disabled:opacity-50"
                >
                  {loading ? '업로드 중...' : '엑셀 Import'}
                </button>
                <button
                  onClick={handleExport}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600"
                >
                  엑셀 Export
                </button>
                <button
                  onClick={openCreateModal}
                  disabled={assetsConfirmed || !canEdit}
                  className="rounded-lg bg-black px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-900 disabled:cursor-not-allowed disabled:bg-black disabled:text-white disabled:opacity-100"
                >
                  자산 등록
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
                  <th className="px-2 py-2 text-center font-bold whitespace-nowrap first:px-3">자산코드</th>
                  <th className="px-2 py-2 text-center font-bold whitespace-nowrap">구분</th>
                  <th className="px-2 py-2 text-center font-bold whitespace-nowrap">Hostname/Domain/Vendor</th>
                  <th className="px-2 py-2 text-center font-bold whitespace-nowrap">IP Address</th>
                  <th className="px-2 py-2 text-center font-bold whitespace-nowrap">버전</th>
                  <th className="px-2 py-2 text-center font-bold whitespace-nowrap">위치</th>
                  <th className="px-2 py-2 text-center font-bold whitespace-nowrap">담당부서</th>
                  <th className="px-2 py-2 text-center font-bold whitespace-nowrap">담당자</th>
                  <th className="px-2 py-2 text-center font-bold whitespace-nowrap">관리자</th>
                  <th className="px-2 py-2 text-center font-bold whitespace-nowrap">중요도</th>
                  <th className="px-2 py-2 text-center font-bold whitespace-nowrap">등록일</th>
                </tr>
              </thead>
              <tbody>
                {pagedRows.map((row) => (
                  <Fragment key={row.id ?? row.asset_code}>
                    <tr
                      onClick={canEdit ? () => openEditModal(row) : undefined}
                      className={`border-t border-slate-100 ${
                        assetsConfirmed || !canEdit
                          ? 'cursor-default'
                          : 'cursor-pointer hover:bg-slate-50'
                      }`}
                    >
                      <td className="px-2 py-2 text-center font-medium whitespace-nowrap first:px-3">
                        {row.asset_code}
                      </td>
                      <td className="px-2 py-2 text-center text-slate-700 whitespace-nowrap">
                        {TYPE_OPTIONS.find((item) => item.value === row.asset_type)?.label || row.asset_type}
                      </td>
                      <td className="px-2 py-2 text-center text-slate-700 whitespace-nowrap">
                        {row.hostname}
                      </td>
                      <td className="px-2 py-2 text-center text-slate-700 whitespace-nowrap">
                        {row.ip_address}
                      </td>
                      <td className="px-2 py-2 text-center text-slate-700 whitespace-nowrap">
                        {row.os_version}
                      </td>
                      <td className="px-2 py-2 text-center text-slate-700 whitespace-nowrap">
                        {row.location}
                      </td>
                      <td className="px-2 py-2 text-center text-slate-700 whitespace-nowrap">
                        {row.department}
                      </td>
                      <td className="px-2 py-2 text-center text-slate-700 whitespace-nowrap">
                        {row.owner_name}
                      </td>
                      <td className="px-2 py-2 text-center text-slate-700 whitespace-nowrap">
                        {row.manager_name}
                      </td>
                      <td className="px-2 py-2 text-center whitespace-nowrap">
                        <Badge>{row.criticality_grade}</Badge>
                      </td>
                      <td className="px-2 py-2 text-center text-slate-700 whitespace-nowrap">
                        {String(row.registered_at || row.updated_at || '').slice(0, 10)}
                      </td>
                    </tr>
                    {editorOpen && modalMode === 'edit' && form.id === row.id ? (
                      <tr key={`${row.id ?? row.asset_code}-editor`} className="border-t border-slate-100 bg-slate-50/60">
                        <td colSpan={11} className="p-4">
                          <AssetEditor
                            open
                            mode={modalMode}
                            form={form}
                            onChange={handleFormChange}
                            onClose={() => setEditorOpen(false)}
                            onSave={handleSaveAsset}
                            saving={saving}
                          />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
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
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 disabled:opacity-50"
              >
                이전
              </button>
              <button
                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 disabled:opacity-50"
              >
                다음
              </button>
            </div>
          </div>
        </Card>

        {editorOpen && modalMode === 'create' ? (
          <AssetEditor
            open
            mode={modalMode}
            form={form}
            onChange={handleFormChange}
            onClose={() => setEditorOpen(false)}
            onSave={handleSaveAsset}
            saving={saving}
          />
        ) : null}

        <Card className="p-5">
          <div className="text-xs font-semibold text-slate-900">정보자산 등록/엑셀 Import 처리 규칙</div>
          <div className="mt-1 text-[11px] text-slate-500">
            시트 이름 기준으로 자산유형을 분류하여 DB에 저장합니다.
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-2 py-2 text-center text-xs font-bold whitespace-nowrap">시트명</th>
                  <th className="px-2 py-2 text-center text-xs font-bold whitespace-nowrap">처리 대상</th>
                  <th className="px-2 py-2 text-center text-xs font-bold whitespace-nowrap">자산코드 규칙</th>
                </tr>
              </thead>
              <tbody>
                {assetImportRules.map((rule) => (
                  <tr key={rule.type} className="border-t border-slate-100">
                    <td className="px-2 py-2 text-center text-xs font-medium whitespace-nowrap">{rule.type}</td>
                    <td className="px-2 py-2 text-center text-xs text-slate-700 whitespace-nowrap">{rule.action}</td>
                    <td className="px-2 py-2 text-center text-xs text-slate-700 whitespace-nowrap">{rule.key}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </section>
    </div>
  );
}
