import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

const PAGE_SIZE = 30;

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

const CONFIRM_WORD_POOL = [
  'TARGET',
  'SCOPE',
  'VERIFY',
  'LOCK',
  'CHECK',
  'GATE',
  'CONTROL',
  'READY',
];

function Card({ children, className = '' }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {children}
    </div>
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

export default function TargetRegistrationPage({
  onNavigate,
  inspectionConfirmed = false,
  canEdit = true,
  canConfirm = false,
  onConfirmInspectionTargets,
  onCancelInspectionConfirmation,
}) {
  const [assets, setAssets] = useState([]);
  const [targets, setTargets] = useState([]);
  const [totalAssetCount, setTotalAssetCount] = useState(0);

  const [keyword, setKeyword] = useState('');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');

  const [loadingAssets, setLoadingAssets] = useState(false);
  const [loadingTargets, setLoadingTargets] = useState(false);
  const [savingAssetId, setSavingAssetId] = useState(null);
  const [removingTargetId, setRemovingTargetId] = useState(null);

  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [confirmWord, setConfirmWord] = useState('');
  const [confirmInput, setConfirmInput] = useState('');
  const [confirmError, setConfirmError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [cancelingConfirmation, setCancelingConfirmation] = useState(false);

  const selectedAssetIdSet = useMemo(
    () => new Set((targets || []).map((row) => row.asset_id)),
    [targets]
  );

  const filteredTargets = useMemo(() => {
    if (typeFilter === 'ALL') return targets;
    return targets.filter((row) => row.asset_type === typeFilter);
  }, [targets, typeFilter]);

  const visibleTargetCount = filteredTargets.length;
  const visibleUnselectedCount = Math.max(totalAssetCount - visibleTargetCount, 0);

  const totalPages = Math.max(1, Math.ceil(totalAssetCount / PAGE_SIZE));
  const pagedAssets = assets;

  async function insertSecurityAuditLog(action, targetId, detail) {
    try {
      const { data: authData } = await supabase.auth.getUser();
      const actorEmail = authData?.user?.email || 'unknown';

      const { error } = await supabase.from('security_audit_logs').insert({
        actor_email: actorEmail,
        action,
        target_type: 'inspection_target',
        target_id: targetId ? String(targetId) : null,
        detail,
      });

      if (error) {
        console.error('security_audit_logs insert 실패:', error.message);
      }
    } catch (err) {
      console.error('security_audit_logs insert 예외:', err);
    }
  }

  async function fetchTargets() {
    const { data, error } = await supabase
      .from('inspection_targets')
      .select(
        'id, asset_id, asset_code, asset_type, hostname, ip_address, location, target_status, selected_at'
      )
      .in('target_status', ['선정', '점검중', '점검완료'])
      .order('selected_at', { ascending: false });

    if (error) throw error;
    setTargets(data || []);
  }

  async function fetchAssetsPage(page = 1, q = '', currentTypeFilter = 'ALL') {
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabase
      .from('assets')
      .select(
        'id, asset_code, asset_type, hostname, ip_address, location',
        { count: 'planned' }
      )
      .order('asset_code', { ascending: true });

    if (currentTypeFilter !== 'ALL') {
      query = query.eq('asset_type', currentTypeFilter);
    }

    const normalized = q.trim();
    if (normalized) {
      const safe = normalized.replace(/,/g, ' ');
      query = query.or(
        `asset_code.ilike.%${safe}%,hostname.ilike.%${safe}%,ip_address.ilike.%${safe}%,location.ilike.%${safe}%`
      );
    }

    const { data, error, count } = await query.range(from, to);

    if (error) throw error;

    setAssets(data || []);
    setTotalAssetCount(count || 0);
  }

  useEffect(() => {
    async function init() {
      try {
        setError('');
        setLoadingTargets(true);
        await fetchTargets();
      } catch (err) {
        console.error(err);
        setError(err.message || '점검 대상 조회 실패');
      } finally {
        setLoadingTargets(false);
      }
    }

    init();
  }, []);

  useEffect(() => {
    async function loadAssets() {
      try {
        setError('');
        setLoadingAssets(true);
        await fetchAssetsPage(currentPage, searchKeyword, typeFilter);
      } catch (err) {
        console.error(err);
        setError(err.message || '자산 목록 조회 실패');
      } finally {
        setLoadingAssets(false);
      }
    }

    loadAssets();
  }, [currentPage, searchKeyword, typeFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchKeyword, typeFilter]);

  useEffect(() => {
    if (inspectionConfirmed) return;

    const nextWord =
      CONFIRM_WORD_POOL[Math.floor(Math.random() * CONFIRM_WORD_POOL.length)] +
      '-' +
      String(Math.floor(1000 + Math.random() * 9000));

    setConfirmWord(nextWord);
    setConfirmInput('');
    setConfirmError('');
  }, [inspectionConfirmed]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  async function handleAddTarget(row) {
    if (!canEdit) {
      setError('현재 권한으로는 점검 대상을 수정할 수 없습니다.');
      return;
    }

    if (inspectionConfirmed) {
      setError('점검 대상이 확정되어 수정할 수 없습니다.');
      return;
    }

    try {
      setSavingAssetId(row.id);
      setMessage('');
      setError('');

      const existing = targets.find((item) => item.asset_id === row.id);
      if (existing) return;

      const payload = {
        asset_id: row.id,
        asset_code: row.asset_code,
        asset_type: row.asset_type,
        hostname: row.hostname || '',
        ip_address: row.ip_address || '',
        location: row.location || '',
        target_status: '선정',
        selected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { data, error: insertError } = await supabase
        .from('inspection_targets')
        .insert(payload)
        .select('id, asset_id, asset_code, asset_type, hostname, ip_address, location, target_status, selected_at')
        .single();

      if (insertError) throw insertError;

      await insertSecurityAuditLog('add_inspection_target', data?.id || row.id, {
        asset_id: row.id,
        asset_code: row.asset_code,
        asset_type: row.asset_type,
        hostname: row.hostname || '',
        ip_address: row.ip_address || '',
        location: row.location || '',
        target_status: '선정',
      });

      setMessage(`${row.asset_code} 자산이 점검 대상으로 추가되었습니다.`);

      setLoadingTargets(true);
      await fetchTargets();
    } catch (err) {
      console.error(err);
      setError(err.message || '점검 대상 추가 실패');
    } finally {
      setSavingAssetId(null);
      setLoadingTargets(false);
    }
  }

  async function handleRemoveTarget(row) {
    if (!canEdit) {
      setError('현재 권한으로는 점검 대상을 수정할 수 없습니다.');
      return;
    }

    if (inspectionConfirmed) {
      setError('점검 대상이 확정되어 수정할 수 없습니다.');
      return;
    }

    try {
      const confirmed = window.confirm(
        `[${row.asset_code}] 점검 대상을 제거하시겠습니까?\n\n이미 등록된 점검 결과는 유지됩니다.`
      );
      if (!confirmed) return;

      setRemovingTargetId(row.id);
      setMessage('');
      setError('');

      const auditDetail = {
        inspection_target_id: row.id,
        asset_id: row.asset_id,
        asset_code: row.asset_code,
        asset_type: row.asset_type,
        hostname: row.hostname || '',
        ip_address: row.ip_address || '',
        location: row.location || '',
        target_status: row.target_status || '',
      };

      const { error: deleteError } = await supabase
        .from('inspection_targets')
        .delete()
        .eq('id', row.id);

      if (deleteError) throw deleteError;

      await insertSecurityAuditLog('remove_inspection_target', row.id, auditDetail);

      setMessage(`${row.asset_code} 자산이 점검 대상에서 제거되었습니다.`);

      setLoadingTargets(true);
      await fetchTargets();
    } catch (err) {
      console.error(err);
      setError(err.message || '점검 대상 제거 실패');
    } finally {
      setRemovingTargetId(null);
      setLoadingTargets(false);
    }
  }

  async function handleConfirmTargets() {
    if (!canConfirm) {
      setConfirmError('현재 권한으로는 점검 대상을 확정할 수 없습니다.');
      return;
    }

    if (inspectionConfirmed) return;

    setMessage('');
    setError('');
    setConfirmError('');

    if (!targets.length) {
      setConfirmError('확정할 점검 대상이 없습니다.');
      return;
    }

    if (confirmInput.trim() !== confirmWord) {
      setConfirmError('확인키가 일치하지 않습니다.');
      return;
    }

    try {
      setConfirming(true);
      await onConfirmInspectionTargets?.();
      setMessage('점검 대상이 확정되었습니다. 점검 결과 등록이 활성화되었습니다.');
    } catch (err) {
      console.error(err);
      setConfirmError(err.message || '점검 대상 확정 실패');
    } finally {
      setConfirming(false);
    }
  }

  async function handleCancelConfirmation() {
    if (!canConfirm) {
      setError('현재 권한으로는 점검 대상 확정을 취소할 수 없습니다.');
      return;
    }

    try {
      setCancelingConfirmation(true);
      setMessage('');
      setError('');
      setConfirmError('');
      await onCancelInspectionConfirmation?.();
      setMessage('점검 대상 확정이 취소되었습니다.');
    } catch (err) {
      console.error(err);
      setError(err.message || '점검 대상 확정 취소 실패');
    } finally {
      setCancelingConfirmation(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className={inspectionConfirmed ? 'border-emerald-300 bg-emerald-50/70' : 'border-slate-700 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-700'}>
        <div className="flex min-h-[72px] w-full flex-col gap-2 px-5 py-2.5 lg:flex-row lg:items-center lg:justify-between">
          <div className="w-full lg:flex-1">
            <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-xs ${inspectionConfirmed ? 'text-slate-600' : 'text-slate-200'}`}>
              <span>점검 대상 검토가 끝났다면 확인키를 입력해 확정하세요.</span>
              {inspectionConfirmed ? (
                <span className="text-xs font-semibold text-slate-900">확정 완료</span>
              ) : (
                <span className="inline-flex items-center rounded-md bg-white/12 px-2 py-0.5 text-[11px] font-semibold text-white ring-1 ring-inset ring-white/10">
                  확인키: <span className="ml-1 font-bold text-rose-400">{confirmWord || '-'}</span>
                </span>
              )}
            </div>
          </div>

          {inspectionConfirmed ? (
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-end lg:w-auto">
              <div className="inline-flex h-8 items-center rounded-lg border border-emerald-300 bg-white px-3 text-xs font-medium text-emerald-700">
                점검 대상 확정 완료
              </div>
              <button
                onClick={handleCancelConfirmation}
                disabled={cancelingConfirmation || !canConfirm}
                className="inline-flex h-8 items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700"
              >
                {cancelingConfirmation ? '취소 중...' : '대상 확정 취소'}
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
                  onClick={handleConfirmTargets}
                  disabled={confirming || !canConfirm}
                  className="inline-flex h-8 items-center rounded-lg bg-white px-3 text-xs font-semibold text-slate-900 sm:w-auto"
                >
                  {confirming ? '확정 중...' : '대상 확정'}
                </button>
              </div>
              {confirmError ? <div className="text-xs text-rose-600">{confirmError}</div> : null}
            </div>
          )}
        </div>
      </Card>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="flex min-h-[112px] w-full flex-col justify-between rounded-2xl p-4">
          <div className="text-[11px] font-semibold text-slate-500">전체 자산</div>
          <div className="mt-2 text-[28px] font-bold tracking-tight text-slate-900">
            {totalAssetCount}
          </div>
          <div className="mt-1 text-[11px] leading-4 text-slate-500">
            현재 조건 기준 자산 수
          </div>
        </Card>

        <Card className="flex min-h-[112px] w-full flex-col justify-between rounded-2xl p-4">
          <div className="text-[11px] font-semibold text-slate-500">점검 대상</div>
          <div className="mt-2 text-[28px] font-bold tracking-tight text-slate-900">
            {visibleTargetCount}
          </div>
          <div className="mt-1 text-[11px] leading-4 text-slate-500">
            현재 선택된 점검 대상
          </div>
        </Card>

        <Card className="flex min-h-[112px] w-full flex-col justify-between rounded-2xl p-4">
          <div className="text-[11px] font-semibold text-slate-500">미선정 자산</div>
          <div className="mt-2 text-[28px] font-bold tracking-tight text-slate-900">
            {visibleUnselectedCount}
          </div>
          <div className="mt-1 text-[11px] leading-4 text-slate-500">
            추가 가능한 자산
          </div>
        </Card>
      </section>

      <Card className="overflow-hidden">
        <SectionHeader
          title="점검 대상 관리"
          desc="점검할 자산을 선택하고 대상 목록을 관리합니다."
          action={
            <div className="flex w-full flex-col gap-2 xl:w-auto xl:flex-row xl:items-center">
              <div className="flex w-full gap-2 xl:w-auto">
                <input
                  value={keyword}
                  onChange={(e) => {
                    const nextKeyword = e.target.value;
                    setKeyword(nextKeyword);
                    setSearchKeyword(nextKeyword);
                    setCurrentPage(1);
                  }}
                  placeholder="자산코드, Hostname, IP 검색"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none placeholder:text-slate-400 xl:w-[280px]"
                />
              </div>

              <button
                onClick={() => onNavigate?.('inspectionResult')}
                className="rounded-lg bg-slate-950 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
              >
                점검 결과 등록으로 이동
              </button>
            </div>
          }
        />

        {(message || error) && (
          <div className="border-b border-slate-200 px-5 py-2.5">
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

        <div className="grid grid-cols-1 gap-4 bg-slate-100/60 p-4 xl:grid-cols-2">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-sm font-semibold text-slate-900">정보자산 목록</div>
            </div>

            <div className="w-full overflow-hidden">
              <table className="w-full table-fixed text-xs">
                <colgroup>
                  <col className="w-[95px]" />
                  <col className="w-[220px]" />
                  <col className="w-[95px]" />
                  <col className="w-[70px]" />
                  <col className="w-[78px]" />
                </colgroup>
                <thead className="bg-slate-50/80 text-slate-500">
                  <tr>
                    <th className="px-2 py-1.5 text-center font-semibold whitespace-nowrap">
                      자산코드
                    </th>
                    <th className="px-2 py-1.5 text-center font-semibold text-xs">
                      Hostname
                    </th>
                    <th className="px-2 py-1.5 text-center font-semibold whitespace-nowrap">
                      IP Address
                    </th>
                    <th className="px-2 py-1.5 text-center font-semibold whitespace-nowrap">
                      위치
                    </th>
                    <th className="px-2 py-1.5 text-center font-semibold whitespace-nowrap">
                      선택
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {loadingAssets ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-xs text-slate-400">
                        목록을 불러오는 중입니다.
                      </td>
                    </tr>
                  ) : pagedAssets.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-xs text-slate-400">
                        표시할 자산이 없습니다.
                      </td>
                    </tr>
                  ) : (
                    pagedAssets.map((row) => {
                      const alreadySelected = selectedAssetIdSet.has(row.id);

                      return (
                        <tr key={row.id} className="border-t border-slate-100 transition hover:bg-slate-50/80">
                          <td className="px-2 py-1 text-center font-medium whitespace-nowrap text-slate-800">
                            {row.asset_code}
                          </td>
                          <td className="px-2 py-1 text-center text-slate-700 text-xs">
                            <div className="truncate" title={row.hostname || '-'}>
                              {row.hostname || '-'}
                            </div>
                          </td>
                          <td className="px-2 py-1 text-center text-slate-700 whitespace-nowrap">
                            {row.ip_address || '-'}
                          </td>
                          <td className="px-2 py-1 text-center text-slate-700 whitespace-nowrap">
                            {row.location || '-'}
                          </td>
                          <td className="px-2 py-1 text-center whitespace-nowrap">
                            <button
                              onClick={() => handleAddTarget(row)}
                              disabled={!canEdit || inspectionConfirmed || alreadySelected || savingAssetId === row.id}
                              className={`inline-flex min-w-[56px] items-center justify-center rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                                inspectionConfirmed || alreadySelected
                                  ? 'cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400'
                                  : 'border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900'
                              }`}
                            >
                              {savingAssetId === row.id ? '처리중' : alreadySelected ? '추가됨' : '추가'}
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between border-t border-slate-200 bg-white px-4 py-3">
              <div className="text-xs text-slate-500">
                총 {totalAssetCount}건 / 페이지 {currentPage} of {totalPages}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={currentPage === 1 || loadingAssets}
                  className="rounded-lg border border-slate-200 px-3 py-1 text-xs text-slate-600 disabled:opacity-50"
                >
                  이전
                </button>
                <button
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages || loadingAssets}
                  className="rounded-lg border border-slate-200 px-3 py-1 text-xs text-slate-600 disabled:opacity-50"
                >
                  다음
                </button>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-sm font-semibold text-slate-900">점검 대상</div>
            </div>

            <div className="w-full overflow-hidden">
              <table className="w-full table-fixed text-xs">
                <colgroup>
                  <col className="w-[95px]" />
                  <col className="w-[80px]" />
                  <col className="w-[210px]" />
                  <col className="w-[95px]" />
                  <col className="w-[78px]" />
                </colgroup>
                <thead className="bg-slate-50/80 text-slate-500">
                  <tr>
                    <th className="px-2 py-1.5 text-center font-semibold whitespace-nowrap">
                      자산코드
                    </th>
                    <th className="px-2 py-1.5 text-center font-semibold whitespace-nowrap">
                      구분
                    </th>
                    <th className="px-2 py-1.5 text-center font-semibold text-xs">
                      Hostname
                    </th>
                    <th className="px-2 py-1.5 text-center font-semibold whitespace-nowrap">
                      IP Address
                    </th>
                    <th className="px-2 py-1.5 text-center font-semibold whitespace-nowrap">
                      제거
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {loadingTargets ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-xs text-slate-400">
                        목록을 불러오는 중입니다.
                      </td>
                    </tr>
                  ) : filteredTargets.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-xs text-slate-400">
                        현재 필터 조건에 맞는 점검 대상이 없습니다.
                      </td>
                    </tr>
                  ) : (
                    filteredTargets.map((row) => (
                      <tr key={row.id} className="border-t border-slate-100 transition hover:bg-slate-50/80">
                        <td className="px-2 py-1 text-center font-medium whitespace-nowrap text-slate-800">
                          {row.asset_code}
                        </td>
                        <td className="px-2 py-1 text-center text-slate-700 whitespace-nowrap">
                          {TYPE_OPTIONS.find((item) => item.value === row.asset_type)?.label ||
                            row.asset_type}
                        </td>
                        <td className="px-2 py-1 text-center text-slate-700 text-xs">
                          <div className="truncate" title={row.hostname || '-'}>
                            {row.hostname || '-'}
                          </div>
                        </td>
                        <td className="px-2 py-1 text-center text-slate-700 whitespace-nowrap">
                          {row.ip_address || '-'}
                        </td>
                        <td className="px-2 py-1 text-center whitespace-nowrap">
                          <button
                            onClick={() => handleRemoveTarget(row)}
                            disabled={!canEdit || inspectionConfirmed || removingTargetId === row.id}
                            className="inline-flex min-w-[56px] items-center justify-center rounded-full border border-rose-200 px-2.5 py-1 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
                          >
                            {removingTargetId === row.id ? '처리중' : '제거'}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
