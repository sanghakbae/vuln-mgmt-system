//취약점 점검 기준
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { exportChecklistWorkbook, parseChecklistWorkbook } from '../utils/checklistWorkbook';

const PAGE_SIZE = 25;

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

const RISK_OPTIONS = ['상', '중', '하'];
const METHOD_OPTIONS = ['자동', '수동'];
const USE_OPTIONS = ['사용', '미사용'];
const CONFIRM_WORD_POOL = ['CHECK', 'STANDARD', 'VERIFY', 'RULE', 'SCOPE', 'CONTROL'];

const EMPTY_FORM = {
  id: null,
  item_code: '',
  asset_type: 'SERVER',
  item_name: '',
  risk_level: '중',
  check_method: '자동',
  use_yn: '사용',
  description: '',
  check_criteria: '',
  remediation: '',
};

function Card({ children, className = '' }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {children}
    </div>
  );
}

function Badge({ children }) {
  const map = {
    상: 'bg-rose-100 text-rose-700',
    중: 'bg-amber-100 text-amber-700',
    하: 'bg-emerald-100 text-emerald-700',
    자동: 'bg-sky-100 text-sky-700',
    수동: 'bg-violet-100 text-violet-700',
    사용: 'bg-emerald-100 text-emerald-700',
    미사용: 'bg-slate-100 text-slate-700',
  };

  return (
    <span
      className={`inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-semibold leading-4 ${
        map[children] || 'bg-slate-100 text-slate-700'
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

function ChecklistModal({ open, mode, form, onChange, onClose, onSave, onDelete, saving, deleting }) {
  if (!open) return null;

  const content = (
      <div className="w-full rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <div className="text-sm font-semibold">
              {mode === 'create' ? '점검 항목 등록' : '점검 항목 수정'}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              항목코드는 입력하지 않으면 자산유형 기준으로 자동 생성됩니다.
            </div>
          </div>
          <button
            onClick={onClose}
            className="inline-flex h-8 items-center rounded-lg border border-slate-200 px-3 text-xs text-slate-600"
          >
            닫기
          </button>
        </div>

        <div className={`${mode === 'create' ? 'max-h-[70vh] overflow-y-auto' : ''} px-5 py-5`}>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Field label="항목코드">
              <input
                value={form.item_code}
                onChange={(e) => onChange('item_code', e.target.value)}
                placeholder="비워두면 자동 생성"
                className="h-8 w-full rounded-lg border border-slate-200 px-3 text-xs outline-none"
              />
            </Field>

            <Field label="자산유형">
              <select
                value={form.asset_type}
                onChange={(e) => onChange('asset_type', e.target.value)}
                className="h-8 w-full rounded-lg border border-slate-200 px-3 text-xs outline-none"
              >
                {TYPE_OPTIONS.filter((item) => item.value !== 'ALL').map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="위험도">
              <select
                value={form.risk_level}
                onChange={(e) => onChange('risk_level', e.target.value)}
                className="h-8 w-full rounded-lg border border-slate-200 px-3 text-xs outline-none"
              >
                {RISK_OPTIONS.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </Field>

            <Field label="점검방식">
              <select
                value={form.check_method}
                onChange={(e) => onChange('check_method', e.target.value)}
                className="h-8 w-full rounded-lg border border-slate-200 px-3 text-xs outline-none"
              >
                {METHOD_OPTIONS.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </Field>

            <Field label="사용여부">
              <select
                value={form.use_yn}
                onChange={(e) => onChange('use_yn', e.target.value)}
                className="h-8 w-full rounded-lg border border-slate-200 px-3 text-xs outline-none"
              >
                {USE_OPTIONS.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </Field>

            <Field label="점검 항목명">
              <input
                value={form.item_name}
                onChange={(e) => onChange('item_name', e.target.value)}
                className="h-8 w-full rounded-lg border border-slate-200 px-3 text-xs outline-none"
              />
            </Field>
          </div>

          <div className="mt-4 grid gap-4">
            <Field label="설명">
              <textarea
                rows={3}
                value={form.description}
                onChange={(e) => onChange('description', e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none"
              />
            </Field>

            <Field label="판정기준">
              <textarea
                rows={4}
                value={form.check_criteria}
                onChange={(e) => onChange('check_criteria', e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none"
              />
            </Field>

            <Field label="조치방안">
              <textarea
                rows={4}
                value={form.remediation}
                onChange={(e) => onChange('remediation', e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none"
              />
            </Field>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 px-5 py-4">
          <div>
            {mode === 'edit' && (
              <button
                onClick={onDelete}
                disabled={deleting}
                className="inline-flex h-8 items-center rounded-lg bg-rose-600 px-4 text-xs font-semibold text-white disabled:opacity-50"
              >
                {deleting ? '삭제 중...' : '삭제'}
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
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
        </div>
      </div>
  );

  if (mode === 'create') {
    return createPortal(
      <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/40 px-4">
        <div className="w-full max-w-5xl">{content}</div>
      </div>,
      document.body
    );
  }

  return content;
}

export default function ChecklistPage({
  checklistConfirmed = false,
  canEdit = true,
  canConfirm = false,
  onConfirmChecklist,
  onCancelChecklistConfirmation,
}) {
  const [rows, setRows] = useState([]);
  const [allowedTypes, setAllowedTypes] = useState([]);
  const [keyword, setKeyword] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('create');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [currentPage, setCurrentPage] = useState(1);
  const [confirmWord, setConfirmWord] = useState('');
  const [confirmInput, setConfirmInput] = useState('');
  const [confirmError, setConfirmError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [cancelingConfirmation, setCancelingConfirmation] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!modalOpen || modalMode !== 'create') return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, [modalOpen, modalMode]);

  async function fetchCheckItems() {
    if (!supabase) {
      throw new Error('Supabase 설정이 없습니다. .env 파일을 확인하세요.');
    }

    const { data, error } = await supabase
      .from('check_items')
      .select(
        'id, item_code, asset_type, item_name, risk_level, check_method, use_yn, description, check_criteria, remediation, source_item_code, updated_at'
      )
      .order('item_code', { ascending: true });

    if (error) throw error;
    setRows(data || []);
  }

  async function fetchAllowedTargetTypes() {
    if (!supabase) {
      throw new Error('Supabase 설정이 없습니다. .env 파일을 확인하세요.');
    }

    const { data, error } = await supabase
      .from('assets')
      .select('asset_type')
      .not('asset_type', 'is', null);

    if (error) throw error;

    const nextTypes = Array.from(
      new Set((data || []).map((row) => String(row.asset_type || '').trim()).filter(Boolean))
    );

    setAllowedTypes(nextTypes);
  }

  useEffect(() => {
    if (checklistConfirmed) return;

    const nextWord =
      CONFIRM_WORD_POOL[Math.floor(Math.random() * CONFIRM_WORD_POOL.length)] +
      '-' +
      String(Math.floor(1000 + Math.random() * 9000));

    setConfirmWord(nextWord);
    setConfirmInput('');
    setConfirmError('');
  }, [checklistConfirmed]);

  useEffect(() => {
    Promise.all([fetchCheckItems(), fetchAllowedTargetTypes()]).catch((err) => {
      console.error(err);
      setError(err.message || '점검 항목 조회 실패');
    });
  }, []);

  async function handleConfirmChecklistClick() {
    if (!canConfirm) {
      setConfirmError('현재 권한으로는 점검 기준을 확정할 수 없습니다.');
      return;
    }

    setMessage('');
    setError('');
    setConfirmError('');

    if (!filteredRows.length) {
      setConfirmError('확정할 점검 기준이 없습니다.');
      return;
    }

    if (confirmInput.trim() !== confirmWord) {
      setConfirmError('확인키가 일치하지 않습니다.');
      return;
    }

    try {
      setConfirming(true);
      await onConfirmChecklist?.();
      setMessage('유형별 점검 기준이 확정되었습니다. 점검 대상 관리가 활성화되었습니다.');
    } catch (err) {
      console.error(err);
      setConfirmError(err.message || '유형별 점검 기준 확정 실패');
    } finally {
      setConfirming(false);
    }
  }

  async function handleCancelChecklistClick() {
    if (!canConfirm) {
      setError('현재 권한으로는 점검 기준 확정을 취소할 수 없습니다.');
      return;
    }

    try {
      setCancelingConfirmation(true);
      setMessage('');
      setError('');
      setConfirmError('');
      await onCancelChecklistConfirmation?.();
      setMessage('유형별 점검 기준 확정이 취소되었습니다.');
    } catch (err) {
      console.error(err);
      setError(err.message || '유형별 점검 기준 확정 취소 실패');
    } finally {
      setCancelingConfirmation(false);
    }
  }

  const kpis = useMemo(() => {
    const total = rows.length;
    const autoCount = rows.filter((row) => row.check_method === '자동').length;
    const activeCount = rows.filter((row) => row.use_yn === '사용').length;

    return [
      { title: '전체 항목', value: String(total), sub: '등록된 점검 항목 수', tone: 'slate' },
      { title: '자동 점검', value: String(autoCount), sub: '스크립트/자동 판정 항목', tone: 'sky' },
      { title: '사용 중', value: String(activeCount), sub: '현재 활성화된 항목', tone: 'emerald' },
    ];
  }, [rows]);

  const toneMap = {
    slate: 'border-slate-200 bg-white',
    sky: 'border-sky-200 bg-sky-50/60',
    emerald: 'border-emerald-200 bg-emerald-50/60',
  };

  const filteredRows = useMemo(() => {
    const q = keyword.trim().toLowerCase();

    return rows.filter((row) => {
      const allowedTypeMatched =
        allowedTypes.length === 0 || allowedTypes.includes(String(row.asset_type || '').trim());
      if (!allowedTypeMatched) return false;

      const typeMatched = typeFilter === 'ALL' || row.asset_type === typeFilter;
      if (!typeMatched) return false;

      if (!q) return true;

      return [
        row.item_code,
        row.item_name,
        row.description,
        row.check_criteria,
        row.remediation,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [rows, keyword, typeFilter, allowedTypes]);

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

  const handleImportClick = () => {
    if (!canEdit) {
      setError('현재 권한으로는 점검 기준을 수정할 수 없습니다.');
      setMessage('');
      return;
    }

    if (checklistConfirmed) {
      setError('유형별 점검 기준 확정 후에는 Import를 할 수 없습니다.');
      setMessage('');
      return;
    }

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

      const parsedRows = await parseChecklistWorkbook(file);

      const rowsWithCode = parsedRows
        .filter((row) => row.item_code)
        .map((row) => ({
          item_code: row.item_code,
          asset_type: row.asset_type,
          item_name: row.item_name,
          risk_level: row.risk_level,
          check_method: row.check_method,
          use_yn: row.use_yn,
          description: row.description,
          check_criteria: row.check_criteria,
          remediation: row.remediation,
          updated_at: new Date().toISOString(),
        }));

      const rowsWithoutCode = parsedRows
        .filter((row) => !row.item_code)
        .map((row) => ({
          asset_type: row.asset_type,
          item_name: row.item_name,
          risk_level: row.risk_level,
          check_method: row.check_method,
          use_yn: row.use_yn,
          description: row.description,
          check_criteria: row.check_criteria,
          remediation: row.remediation,
          updated_at: new Date().toISOString(),
        }));

      if (rowsWithCode.length > 0) {
        const { error: upsertError } = await supabase
          .from('check_items')
          .upsert(rowsWithCode, { onConflict: 'item_code' });

        if (upsertError) throw upsertError;
      }

      if (rowsWithoutCode.length > 0) {
        const { error: insertError } = await supabase
          .from('check_items')
          .insert(rowsWithoutCode);

        if (insertError) throw insertError;
      }

      await fetchCheckItems();
      setMessage(
        `${parsedRows.length}건 처리 완료 (신규 ${rowsWithoutCode.length}건, 수정 ${rowsWithCode.length}건)`
      );
    } catch (err) {
      console.error(err);
      setError(err.message || '엑셀 Import 실패');
    } finally {
      setLoading(false);
      event.target.value = '';
    }
  };

  const handleExport = () => {
    setMessage('');
    setError('');
    exportChecklistWorkbook(rows);
    setMessage('엑셀 Export를 시작했습니다.');
  };

  const openCreateModal = () => {
    if (!canEdit) {
      setError('현재 권한으로는 점검 기준을 등록할 수 없습니다.');
      setMessage('');
      return;
    }

    if (checklistConfirmed) {
      setError('유형별 점검 기준 확정 후에는 항목을 등록할 수 없습니다.');
      setMessage('');
      return;
    }

    setModalMode('create');
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };

  const openEditModal = (row) => {
    if (!canEdit) {
      setError('현재 권한으로는 점검 기준을 수정할 수 없습니다.');
      setMessage('');
      return;
    }

    if (checklistConfirmed) {
      setError('유형별 점검 기준 확정 후에는 항목을 수정할 수 없습니다.');
      setMessage('');
      return;
    }

    if (modalOpen && modalMode === 'edit' && form.id === row.id) {
      setModalOpen(false);
      return;
    }

    setModalMode('edit');
    setForm({
      id: row.id,
      item_code: row.item_code ?? '',
      asset_type: row.asset_type ?? 'SERVER',
      item_name: row.item_name ?? '',
      risk_level: row.risk_level ?? '중',
      check_method: row.check_method ?? '자동',
      use_yn: row.use_yn ?? '사용',
      description: row.description ?? '',
      check_criteria: row.check_criteria ?? '',
      remediation: row.remediation ?? '',
    });
    setModalOpen(true);
  };

  const handleFormChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleDelete = async () => {
    try {
      if (checklistConfirmed) {
        throw new Error('유형별 점검 기준 확정 후에는 항목을 변경할 수 없습니다.');
      }

      if (!canEdit) {
        throw new Error('현재 권한으로는 점검 기준을 변경할 수 없습니다.');
      }

      if (!form.id) {
        throw new Error('삭제할 점검 항목이 없습니다.');
      }

      const confirmed = window.confirm(
        `[${form.item_code || '-'}] 점검 항목을 삭제하시겠습니까?\n\n실제 삭제 대신 미사용 처리됩니다.`
      );
      if (!confirmed) return;

      setDeleting(true);
      setMessage('');
      setError('');

      if (!supabase) {
        throw new Error('Supabase 설정이 없습니다. .env 파일을 확인하세요.');
      }

      const { error: updateError } = await supabase
        .from('check_items')
        .update({
          use_yn: '미사용',
          updated_at: new Date().toISOString(),
        })
        .eq('id', form.id);

      if (updateError) throw updateError;

      setModalOpen(false);
      setMessage('점검 항목이 미사용 처리되었습니다.');
      await fetchCheckItems();
    } catch (err) {
      console.error(err);
      setError(err.message || '점검 항목 삭제 실패');
    } finally {
      setDeleting(false);
    }
  };

  const handleSave = async () => {
    try {
      if (checklistConfirmed) {
        throw new Error('유형별 점검 기준 확정 후에는 항목을 저장할 수 없습니다.');
      }

      if (!canEdit) {
        throw new Error('현재 권한으로는 점검 기준을 저장할 수 없습니다.');
      }

      setSaving(true);
      setMessage('');
      setError('');

      if (!supabase) {
        throw new Error('Supabase 설정이 없습니다. .env 파일을 확인하세요.');
      }

      const payload = {
        asset_type: form.asset_type,
        item_name: form.item_name,
        risk_level: form.risk_level,
        check_method: form.check_method,
        use_yn: form.use_yn,
        description: form.description,
        check_criteria: form.check_criteria,
        remediation: form.remediation,
        updated_at: new Date().toISOString(),
      };

      if (modalMode === 'create') {
        if (form.item_code?.trim()) {
          payload.item_code = form.item_code.trim();

          const { error: upsertError } = await supabase
            .from('check_items')
            .upsert(payload, { onConflict: 'item_code' });

          if (upsertError) throw upsertError;
        } else {
          const { error: insertError } = await supabase
            .from('check_items')
            .insert(payload);

          if (insertError) throw insertError;
        }

        setMessage('점검 항목이 등록되었습니다.');
      } else {
        payload.item_code = form.item_code;

        const { error: updateError } = await supabase
          .from('check_items')
          .update(payload)
          .eq('id', form.id);

        if (updateError) throw updateError;

        setMessage('점검 항목이 수정되었습니다.');
      }

      setModalOpen(false);
      await fetchCheckItems();
    } catch (err) {
      console.error(err);
      setError(err.message || '점검 항목 저장 실패');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
    <Card className={checklistConfirmed ? 'border-emerald-300 bg-emerald-50/70' : 'border-slate-700 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-700'}>
      <div className="flex min-h-[72px] w-full flex-col gap-2 px-5 py-2.5 lg:flex-row lg:items-center lg:justify-between">
        <div className="w-full lg:flex-1">
          <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-xs ${checklistConfirmed ? 'text-slate-600' : 'text-slate-200'}`}>
            <span>유형별 점검 기준 검토가 끝났다면 확인키를 입력해 확정하세요.</span>
            {checklistConfirmed ? (
              <span className="text-xs font-semibold text-slate-900">확정 완료</span>
            ) : (
              <span className="inline-flex items-center rounded-md bg-white/12 px-2 py-0.5 text-[11px] font-semibold text-white ring-1 ring-inset ring-white/10">
                확인키: <span className="ml-1 font-bold text-rose-400">{confirmWord || '-'}</span>
              </span>
            )}
          </div>
        </div>

        {checklistConfirmed ? (
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-end lg:w-auto">
            <div className="inline-flex h-8 items-center rounded-lg border border-emerald-300 bg-white px-3 text-xs font-medium text-emerald-700">
              유형별 점검 기준 확정 완료
            </div>
            <button
              onClick={handleCancelChecklistClick}
              disabled={cancelingConfirmation || !canConfirm}
              className="inline-flex h-8 items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700"
            >
              {cancelingConfirmation ? '취소 중...' : '기준 확정 취소'}
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
                onClick={handleConfirmChecklistClick}
                disabled={confirming || !canConfirm}
                className="inline-flex h-8 items-center rounded-lg bg-white px-3 text-xs font-semibold text-slate-900 sm:w-auto"
              >
                {confirming ? '확정 중...' : '기준 확정'}
              </button>
            </div>
            {confirmError ? <div className="text-xs text-rose-600">{confirmError}</div> : null}
          </div>
        )}
      </div>
    </Card>

    <ChecklistModal
      open={modalOpen && modalMode === 'create'}
      mode="create"
      form={form}
      onChange={handleFormChange}
      onClose={() => setModalOpen(false)}
      onSave={handleSave}
      onDelete={handleDelete}
      saving={saving}
      deleting={deleting}
    />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {kpis.map((item) => (
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
            title="점검 항목 설정"
            desc="자산유형별 점검 기준, 점검방식, 위험도, 사용여부를 관리합니다."
            action={
              <div className="flex flex-wrap gap-2">
                <input
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none placeholder:text-slate-400 sm:w-[340px] xl:w-[420px]"
                  placeholder="항목코드, 점검 항목명 검색"
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={handleImport}
                />
                <button
                  onClick={handleImportClick}
                  disabled={loading || checklistConfirmed || !canEdit}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 disabled:opacity-50"
                >
                  {loading ? '업로드 중...' : '엑셀 Import'}
                </button>
                <button
                  onClick={handleExport}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600"
                >
                  엑셀 Export
                </button>
                <button
                  onClick={openCreateModal}
                  disabled={checklistConfirmed || !canEdit}
                  className="rounded-lg bg-slate-950 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  항목 등록
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
                  <th className="px-2 py-2 text-center font-bold whitespace-nowrap first:px-3">항목코드</th>
                  <th className="px-2 py-2 text-center font-bold whitespace-nowrap">구분</th>
                  <th className="px-2 py-2 text-center font-bold whitespace-nowrap">점검 항목명</th>
                  <th className="px-2 py-2 text-center font-bold whitespace-nowrap">설명</th>
                  <th className="px-2 py-2 text-center font-bold whitespace-nowrap">위험도</th>
                  <th className="px-2 py-2 text-center font-bold whitespace-nowrap">점검방식</th>
                  <th className="px-2 py-2 text-center font-bold whitespace-nowrap">사용여부</th>
                  <th className="px-2 py-2 text-center font-bold whitespace-nowrap">수정일</th>
                </tr>
              </thead>
              <tbody>
                {pagedRows.map((row) => (
                  <Fragment key={row.id}>
                    <tr
                      onClick={canEdit ? () => openEditModal(row) : undefined}
                      className={`border-t border-slate-100 ${
                        canEdit ? 'cursor-pointer hover:bg-slate-50' : 'cursor-default'
                      }`}
                    >
                      <td className="px-1 py-1 text-center font-medium whitespace-nowrap first:px-3">
                        {row.item_code}
                      </td>

                      <td className="px-1 py-1 text-center text-slate-700 whitespace-nowrap">
                        {TYPE_OPTIONS.find((item) => item.value === row.asset_type)?.label || row.asset_type}
                      </td>

                      <td className="px-1 py-1 text-left text-slate-700 whitespace-nowrap">
                        {row.item_name}
                      </td>

                      <td className="px-1 py-1 text-left text-slate-700">
                        <div className="max-w-[260px] truncate">{row.description}</div>
                      </td>

                      <td className="px-1 py-1 text-center whitespace-nowrap">
                        <Badge>{row.risk_level}</Badge>
                      </td>

                      <td className="px-1 py-1 text-center whitespace-nowrap">
                        <Badge>{row.check_method}</Badge>
                      </td>

                      <td className="px-1 py-1 text-center whitespace-nowrap">
                        <Badge>{row.use_yn}</Badge>
                      </td>

                      <td className="px-2 py-2 text-center text-slate-700 whitespace-nowrap">
                        {String(row.updated_at || '').slice(0, 16).replace('T', ' ')}
                      </td>
                    </tr>
                    {modalOpen && modalMode === 'edit' && form.id === row.id ? (
                      <tr className="border-t border-slate-100 bg-slate-50/60">
                        <td colSpan={8} className="p-4">
                          <ChecklistModal
                            open
                            mode="edit"
                            form={form}
                            onChange={handleFormChange}
                            onClose={() => setModalOpen(false)}
                            onSave={handleSave}
                            onDelete={handleDelete}
                            saving={saving}
                            deleting={deleting}
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
      </section>
    </div>
  );
}
