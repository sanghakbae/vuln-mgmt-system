import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';

const REPORT_TYPES = [
  { label: '전체 점검 결과 보고서', value: 'FULL' },
  { label: '취약점 조치 현황 보고서', value: 'VULN' },
  { label: '자산별 상세 보고서', value: 'ASSET' },
];

const OUTPUT_FORMATS = [
  { label: 'HTML', value: 'HTML' },
  { label: 'PDF', value: 'PDF' },
];

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

const EMPTY_FORM = {
  report_name: '',
  report_type: 'FULL',
  asset_type: 'ALL',
  include_only_vuln: false,
  author_name: '',
  output_format: 'HTML',
};

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

function Field({ label, children }) {
  return (
    <label className="space-y-1">
      <div className="text-sm font-medium text-slate-500">{label}</div>
      {children}
    </label>
  );
}

function formatDateTime(value) {
  if (!value) return '-';
  return String(value).slice(0, 16).replace('T', ' ');
}

function formatDate(value) {
  if (!value) return '-';
  return String(value).slice(0, 10);
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function downloadTextFile(filename, content, mimeType = 'text/html;charset=utf-8') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function openPrintWindow(html) {
  const win = window.open('', '_blank', 'width=1200,height=900');
  if (!win) {
    alert('팝업이 차단되어 PDF 인쇄 창을 열 수 없습니다.');
    return;
  }

  win.document.open();
  win.document.write(html);
  win.document.close();

  const triggerPrint = () => {
    win.focus();
    win.print();
  };

  if (win.document.readyState === 'complete') {
    setTimeout(triggerPrint, 300);
  } else {
    win.onload = () => setTimeout(triggerPrint, 300);
  }
}

function getStorageKey(reportId, generatedAt) {
  return `report-preview:${reportId}:${generatedAt || 'no-date'}`;
}

function saveReportContentToStorage(storageKey, payload) {
  localStorage.setItem(storageKey, JSON.stringify(payload));
}

function loadReportContentFromStorage(storageKey) {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch (err) {
    console.error('report storage parse 실패:', err);
    return null;
  }
}

function resolveReportTypeText(reportType, includeOnlyVuln) {
  if (includeOnlyVuln) return '취약점만';
  if (reportType === 'FULL') return '전체';
  if (reportType === 'VULN') return '취약점만';
  if (reportType === 'ASSET') return '자산별';
  return '전체';
}

function resolveReportScopeText(assetType, includeOnlyVuln, detailCount) {
  const assetLabel =
    TYPE_OPTIONS.find((row) => row.value === assetType)?.label || assetType || '전체';

  if (includeOnlyVuln) {
    return `${assetLabel} · 취약 항목 ${detailCount}건`;
  }

  return assetType === 'ALL' ? '전체 자산' : `${assetLabel} 자산`;
}

function inferAssetTypeFromReport(row) {
  const scope = String(row?.report_scope || '');

  for (const item of TYPE_OPTIONS) {
    if (item.value !== 'ALL' && scope.includes(item.label)) {
      return item.value;
    }
  }

  return 'ALL';
}

function inferReportOptionsFromRow(row) {
  const reportTypeText = String(row?.report_type || '');
  const includeOnlyVuln =
    reportTypeText.includes('취약점만') || String(row?.report_scope || '').includes('취약 항목');

  let reportType = 'FULL';
  if (reportTypeText.includes('자산별')) reportType = 'ASSET';
  else if (reportTypeText.includes('취약점만')) reportType = 'VULN';

  return {
    reportName: row?.report_name || '보안 점검 보고서',
    reportType,
    assetType: inferAssetTypeFromReport(row),
    includeOnlyVuln,
    outputFormat: row?.output_format || 'HTML',
    authorName: row?.generated_by || '',
    generatedAt:
      formatDateTime(row?.generated_at || row?.created_at) ||
      new Date().toISOString().slice(0, 16).replace('T', ' '),
  };
}

function buildHtmlReport({
  meta,
  summary,
  assetTypeRows,
  resultRows,
  vulnerabilityRows,
  detailRows,
}) {
  const summaryCards = [
    ['전체 자산', summary.totalAssets],
    ['전체 점검 결과', summary.totalInspections],
    ['취약 건수', summary.totalVuln],
    ['조치 진행', summary.inProgressVuln],
  ];

  const summaryHtml = summaryCards
    .map(
      ([label, value]) => `
      <div class="summary-card">
        <div class="summary-label">${escapeHtml(label)}</div>
        <div class="summary-value">${escapeHtml(value)}</div>
      </div>
    `
    )
    .join('');

  const assetTypeTable = assetTypeRows.length
    ? assetTypeRows
        .map(
          (row) => `
      <tr>
        <td>${escapeHtml(row.label)}</td>
        <td style="text-align:right;">${escapeHtml(row.count)}</td>
      </tr>
    `
        )
        .join('')
    : `<tr><td colspan="2" style="text-align:center;">데이터 없음</td></tr>`;

  const resultTable = resultRows.length
    ? resultRows
        .map(
          (row) => `
      <tr>
        <td>${escapeHtml(row.label)}</td>
        <td style="text-align:right;">${escapeHtml(row.count)}</td>
      </tr>
    `
        )
        .join('')
    : `<tr><td colspan="2" style="text-align:center;">데이터 없음</td></tr>`;

  const vulnTable = vulnerabilityRows.length
    ? vulnerabilityRows
        .map(
          (row) => `
      <tr>
        <td>${escapeHtml(row.asset_code || '-')}</td>
        <td>${escapeHtml(TYPE_LABELS[row.asset_type] || row.asset_type || '-')}</td>
        <td>${escapeHtml(row.item_code || '-')}</td>
        <td>${escapeHtml(row.vuln_title || '-')}</td>
        <td>${escapeHtml(row.risk_level || '-')}</td>
        <td>${escapeHtml(row.action_status || '-')}</td>
        <td>${escapeHtml(formatDate(row.due_date))}</td>
      </tr>
    `
        )
        .join('')
    : `<tr><td colspan="7" style="text-align:center;">데이터 없음</td></tr>`;

  const detailTable = detailRows.length
    ? detailRows
        .map(
          (row) => `
      <tr>
        <td>${escapeHtml(row.asset_code || '-')}</td>
        <td>${escapeHtml(TYPE_LABELS[row.asset_type] || row.asset_type || '-')}</td>
        <td>${escapeHtml(row.item_code || '-')}</td>
        <td>${escapeHtml(row.item_name || '-')}</td>
        <td>${escapeHtml(row.risk_level || '-')}</td>
        <td>${escapeHtml(row.result_status || '-')}</td>
        <td>${escapeHtml(row.inspection_status || '-')}</td>
        <td class="detail-text-cell"><div class="table-like-text">${escapeHtml(row.result_text || '-')}</div></td>
      </tr>
    `
        )
        .join('')
    : `<tr><td colspan="8" style="text-align:center;">데이터 없음</td></tr>`;

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(meta.reportName)}</title>
<style>
  body {
    font-family: Arial, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
    margin: 32px;
    color: #0f172a;
    background: #ffffff;
  }
  .header {
    border-bottom: 2px solid #e2e8f0;
    padding-bottom: 16px;
    margin-bottom: 24px;
  }
  .title {
    font-size: 28px;
    font-weight: 700;
    margin-bottom: 8px;
  }
  .meta {
    font-size: 13px;
    color: #475569;
    line-height: 1.7;
  }
  .summary-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
    margin-bottom: 24px;
  }
  .summary-card {
    border: 1px solid #cbd5e1;
    border-radius: 14px;
    padding: 16px;
    background: #f8fafc;
  }
  .summary-label {
    font-size: 13px;
    color: #64748b;
    margin-bottom: 8px;
  }
  .summary-value {
    font-size: 28px;
    font-weight: 700;
  }
  .section {
    margin-top: 28px;
  }
  .dual-section-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    align-items: start;
  }
  .section h2 {
    font-size: 18px;
    margin: 0 0 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid #e2e8f0;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }
  th, td {
    border: 1px solid #e2e8f0;
    padding: 10px 12px;
    font-size: 12px;
    vertical-align: top;
    word-break: break-word;
    text-align: center;
  }
  th {
    background: #f8fafc;
    font-weight: 700;
  }
  .table-like-text {
    white-space: pre;
    overflow-x: auto;
    overflow-y: hidden;
    text-align: left;
    font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
    line-height: 1.5;
  }
  .detail-text-cell {
    text-align: left;
    padding: 0;
  }
  .detail-table col.col-asset-code { width: 8%; }
  .detail-table col.col-type { width: 8%; }
  .detail-table col.col-item-code { width: 8%; }
  .detail-table col.col-item-name { width: 12%; }
  .detail-table col.col-risk { width: 6%; }
  .detail-table col.col-result { width: 7%; }
  .detail-table col.col-status { width: 8%; }
  .detail-table col.col-detail { width: 43%; }
  @media (max-width: 1100px) {
    .dual-section-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
</head>
<body>
  <div class="header">
    <div class="title">${escapeHtml(meta.reportName)}</div>
    <div class="meta">
      보고서 유형: ${escapeHtml(meta.reportTypeText)}<br/>
      출력 형식: ${escapeHtml(meta.outputFormat)}<br/>
      생성일시: ${escapeHtml(meta.generatedAt)}<br/>
      작성자: ${escapeHtml(meta.author || '-')}<br/>
      보고 범위: ${escapeHtml(meta.reportScope)}<br/>
      자산 구분 필터: ${escapeHtml(meta.assetTypeLabel)}<br/>
      취약 항목만 포함: ${meta.includeOnlyVuln ? '예' : '아니오'}
    </div>
  </div>

  <div class="summary-grid">
    ${summaryHtml}
  </div>

  <div class="section dual-section-grid">
    <div>
      <h2>자산 구분별 현황</h2>
      <table class="summary-table">
        <thead>
          <tr><th>구분</th><th>건수</th></tr>
        </thead>
        <tbody>${assetTypeTable}</tbody>
      </table>
    </div>
    <div>
      <h2>점검 결과 분포</h2>
      <table class="summary-table">
        <thead>
          <tr><th>결과</th><th>건수</th></tr>
        </thead>
        <tbody>${resultTable}</tbody>
      </table>
    </div>
  </div>

  <div class="section">
    <h2>취약점 조치 현황</h2>
    <table class="vuln-table">
      <thead>
        <tr>
          <th>자산코드</th>
          <th>구분</th>
          <th>항목코드</th>
          <th>취약점명</th>
          <th>위험도</th>
          <th>조치상태</th>
          <th>조치예정일</th>
        </tr>
      </thead>
      <tbody>${vulnTable}</tbody>
    </table>
  </div>

  <div class="section">
    <h2>상세 점검 결과</h2>
    <table class="detail-table">
      <colgroup>
        <col class="col-asset-code" />
        <col class="col-type" />
        <col class="col-item-code" />
        <col class="col-item-name" />
        <col class="col-risk" />
        <col class="col-result" />
        <col class="col-status" />
        <col class="col-detail" />
      </colgroup>
      <thead>
        <tr>
          <th>자산코드</th>
          <th>구분</th>
          <th>항목코드</th>
          <th>항목명</th>
          <th>위험도</th>
          <th>판정결과</th>
          <th>점검상태</th>
          <th>판정근거 / 점검내용</th>
        </tr>
      </thead>
      <tbody>${detailTable}</tbody>
    </table>
  </div>
</body>
</html>`;
}

async function buildPreviewReportHtml(row) {
  const options = inferReportOptionsFromRow(row);

  const [assetsRes, inspectionsRes, vulnsRes] = await Promise.all([
    supabase
      .from('assets')
      .select('id, asset_code, asset_type, hostname, ip_address'),
    supabase
      .from('inspection_results')
      .select(
        'id, target_id, asset_id, item_id, asset_code, asset_type, item_code, item_name, risk_level, result_status, result_text, checked_at, inspection_status, action_status, updated_at'
      )
      .order('updated_at', { ascending: false }),
    supabase
      .from('vulnerabilities')
      .select('*')
      .order('updated_at', { ascending: false }),
  ]);

  if (assetsRes.error) throw assetsRes.error;
  if (inspectionsRes.error) throw inspectionsRes.error;
  if (vulnsRes.error) throw vulnsRes.error;

  let assets = assetsRes.data || [];
  let inspections = inspectionsRes.data || [];
  let vulnerabilities = vulnsRes.data || [];

  if (options.assetType !== 'ALL') {
    assets = assets.filter((item) => item.asset_type === options.assetType);
    inspections = inspections.filter((item) => item.asset_type === options.assetType);
  }

  if (options.includeOnlyVuln) {
    inspections = inspections.filter((item) => item.result_status === '취약');
  }

  const inspectionIds = Array.from(new Set(inspections.map((item) => item.id)));
  vulnerabilities = vulnerabilities.filter((item) => {
    if (!inspectionIds.length) return false;
    return inspectionIds.includes(item.inspection_result_id);
  });

  const vulnByInspectionId = Object.fromEntries(
    vulnerabilities.map((item) => [item.inspection_result_id, item])
  );

  let detailRows = inspections.map((item) => ({
    ...item,
    vuln_title: vulnByInspectionId[item.id]?.vuln_title || item.item_name,
    due_date: vulnByInspectionId[item.id]?.due_date || null,
  }));

  if (options.reportType === 'VULN') {
    detailRows = detailRows.filter((item) => item.result_status === '취약');
  }

  if (options.reportType === 'ASSET') {
    detailRows = detailRows.sort((a, b) => {
      const aCode = a.asset_code || '';
      const bCode = b.asset_code || '';
      return aCode.localeCompare(bCode);
    });
  }

  const assetTypeCountMap = assets.reduce((acc, item) => {
    const key = item.asset_type || 'ETC';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const assetTypeRows = TYPE_OPTIONS.filter((item) => item.value !== 'ALL')
    .map((item) => ({
      label: item.label,
      count: assetTypeCountMap[item.value] || 0,
    }))
    .filter((item) => item.count > 0);

  const resultCountMap = detailRows.reduce((acc, item) => {
    const key = item.result_status || '미점검';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const resultRows = ['양호', '취약', '예외', '재확인', '미점검'].map((label) => ({
    label,
    count: resultCountMap[label] || 0,
  }));

  const vulnerabilityRows = vulnerabilities.map((item) => {
    const matchedInspection = inspections.find(
      (inspection) => inspection.id === item.inspection_result_id
    );

    return {
      ...item,
      asset_code: matchedInspection?.asset_code || '-',
      asset_type: matchedInspection?.asset_type || '',
      item_code: matchedInspection?.item_code || '-',
      vuln_title: item.vuln_title || matchedInspection?.item_name || '-',
      risk_level: item.risk_level || matchedInspection?.risk_level || '-',
    };
  });

  const summary = {
    totalAssets: assets.length,
    totalInspections: detailRows.length,
    totalVuln: detailRows.filter((item) => item.result_status === '취약').length,
    inProgressVuln: vulnerabilityRows.filter((item) =>
      ['조치계획', '조치중', '검토중', 'OPEN', 'IN_PROGRESS'].includes(item.action_status)
    ).length,
  };

  return {
    html: buildHtmlReport({
      meta: {
        reportName: options.reportName,
        reportTypeText: resolveReportTypeText(options.reportType, options.includeOnlyVuln),
        outputFormat: options.outputFormat,
        generatedAt: options.generatedAt,
        author: options.authorName,
        reportScope: resolveReportScopeText(
          options.assetType,
          options.includeOnlyVuln,
          detailRows.length
        ),
        assetTypeLabel:
          TYPE_OPTIONS.find((item) => item.value === options.assetType)?.label ||
          options.assetType,
        includeOnlyVuln: options.includeOnlyVuln,
      },
      summary,
      assetTypeRows,
      resultRows,
      vulnerabilityRows,
      detailRows,
    }),
    outputFormat: options.outputFormat,
    reportName: options.reportName,
  };
}

function ReportModal({
  open,
  form,
  saving,
  onChange,
  onClose,
  onGenerate,
}) {
  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/40 px-4">
      <div className="w-full max-w-[960px] rounded-xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <div className="text-sm font-semibold text-slate-900">보고서 생성</div>
            <div className="mt-1 text-xs text-slate-500">
              점검 결과와 취약점 조치 현황을 바탕으로 보고서를 생성합니다.
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600"
          >
            닫기
          </button>
        </div>

        <div className="px-5 py-5">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="보고서명">
              <input
                value={form.report_name}
                onChange={(e) => onChange('report_name', e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs outline-none"
                placeholder="예: 2026년 3월 정기 보안점검 결과보고서"
              />
            </Field>

            <Field label="작성자">
              <input
                value={form.author_name}
                onChange={(e) => onChange('author_name', e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs outline-none"
                placeholder="예: admin@muhayou.com"
              />
            </Field>

            <Field label="보고서 유형">
              <select
                value={form.report_type}
                onChange={(e) => onChange('report_type', e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs outline-none"
              >
                {REPORT_TYPES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="출력 형식">
              <select
                value={form.output_format}
                onChange={(e) => onChange('output_format', e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs outline-none"
              >
                {OUTPUT_FORMATS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="자산 구분">
              <select
                value={form.asset_type}
                onChange={(e) => onChange('asset_type', e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs outline-none"
              >
                {TYPE_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </Field>

            <div className="md:col-span-2">
              <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2.5 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={form.include_only_vuln}
                  onChange={(e) => onChange('include_only_vuln', e.target.checked)}
                />
                취약 판정 결과만 포함
              </label>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-1.5 text-xs text-slate-600"
          >
            취소
          </button>
          <button
            onClick={onGenerate}
            disabled={saving}
            className="rounded-lg bg-slate-950 px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            {saving ? '생성 중...' : '보고서 생성'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function PreviewModal({
  open,
  row,
  previewHtml,
  previewPayload,
  onClose,
  onDownload,
}) {
  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[1001] flex items-center justify-center bg-slate-950/50 px-4">
      <div className="flex h-[90vh] w-full max-w-[1400px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <div className="truncate text-base font-semibold text-slate-900">
              {row?.report_name || '보고서 미리보기'}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {row?.report_type || '-'} · {formatDateTime(row?.generated_at || row?.created_at)}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {previewHtml ? (
              <button
                onClick={onDownload}
                className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white"
              >
                {previewPayload?.outputFormat === 'PDF' ? 'PDF 다시 출력' : 'HTML 다시 다운로드'}
              </button>
            ) : null}

            <button
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600"
            >
              닫기
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 bg-slate-50">
          {previewHtml ? (
            <iframe
              title="report-preview"
              srcDoc={previewHtml}
              className="h-full w-full border-0 bg-white"
            />
          ) : (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-500">
              저장된 보고서 본문이 없습니다. 이 보고서는 예전 데이터이거나 미리보기 정보가 저장되지 않았습니다.
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function ReportPage() {
  const [rows, setRows] = useState([]);
  const [localRows, setLocalRows] = useState([]);

  const [keyword, setKeyword] = useState('');
  const [searchKeyword, setSearchKeyword] = useState('');

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewRow, setPreviewRow] = useState(null);
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewPayload, setPreviewPayload] = useState(null);

  useEffect(() => {
    fetchReports();
    preloadAuthor();
  }, []);

  async function preloadAuthor() {
    try {
      const { data } = await supabase.auth.getUser();
      const email = data?.user?.email || '';
      if (email) {
        setForm((prev) => ({
          ...prev,
          author_name: prev.author_name || email,
        }));
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function insertSecurityAuditLog(action, targetId, detail) {
    try {
      const { data: authData } = await supabase.auth.getUser();
      const actorEmail = authData?.user?.email || 'unknown';

      await supabase.from('security_audit_logs').insert({
        actor_email: actorEmail,
        action,
        target_type: 'report',
        target_id: targetId ? String(targetId) : null,
        detail,
      });
    } catch (err) {
      console.error('audit log 실패:', err);
    }
  }

  async function fetchReports() {
    try {
      setLoading(true);
      setError('');

      const { data, error } = await supabase
        .from('reports')
        .select('*')
        .order('generated_at', { ascending: false });

      if (error) {
        console.warn('reports 조회 실패:', error.message);
        setRows([]);
        return;
      }

      setRows(data || []);
    } catch (err) {
      console.error(err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  function handleFormChange(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function openCreateModal() {
    const now = new Date();
    const defaultName = `${now.getFullYear()}년 ${now.getMonth() + 1}월 보안 점검 결과보고서`;

    setForm((prev) => ({
      ...prev,
      report_name: prev.report_name || defaultName,
      report_type: 'FULL',
      asset_type: 'ALL',
      include_only_vuln: false,
      output_format: 'HTML',
    }));
    setModalOpen(true);
  }

  async function saveReportHistory({
    reportName,
    reportTypeText,
    reportScope,
    generatedBy,
    outputFormat,
    storageKey,
  }) {
    const now = new Date().toISOString();

    try {
      const { data, error } = await supabase
        .from('reports')
        .insert({
          report_type: reportTypeText,
          report_name: reportName,
          report_scope: reportScope,
          report_status: '생성완료',
          generated_by: generatedBy || null,
          file_path: storageKey || null,
          generated_at: now,
          updated_at: now,
        })
        .select('*')
        .single();

      if (error) {
        console.warn('reports 저장 실패:', error.message);

        const localId = `local-${Date.now()}`;
        const localRow = {
          id: localId,
          report_type: reportTypeText,
          report_name: reportName,
          report_scope: reportScope,
          report_status: '생성완료',
          generated_by: generatedBy || null,
          file_path: storageKey || null,
          generated_at: now,
          created_at: now,
          updated_at: now,
          output_format: outputFormat,
        };

        setLocalRows((prev) => [localRow, ...prev]);

        if (storageKey) {
          const stored = loadReportContentFromStorage(storageKey);
          if (stored) {
            const newStorageKey = getStorageKey(localId, now);
            saveReportContentToStorage(newStorageKey, stored);
            localRow.file_path = newStorageKey;
            setLocalRows((prev) => [localRow, ...prev.filter((row) => row.id !== localId)]);
          }
        }

        return;
      }

      let finalRow = {
        ...data,
        output_format: outputFormat,
      };

      if (storageKey) {
        const stored = loadReportContentFromStorage(storageKey);
        if (stored) {
          const dbStorageKey = getStorageKey(data.id, data.generated_at || now);
          saveReportContentToStorage(dbStorageKey, stored);

          const { error: updateError } = await supabase
            .from('reports')
            .update({
              file_path: dbStorageKey,
              updated_at: new Date().toISOString(),
            })
            .eq('id', data.id);

          if (!updateError) {
            finalRow = {
              ...finalRow,
              file_path: dbStorageKey,
            };
          }
        }
      }

      setRows((prev) => [finalRow, ...prev]);
      await insertSecurityAuditLog('create_report', data?.id, {
        report_name: reportName,
        report_type: reportTypeText,
        output_format: outputFormat,
      });
    } catch (err) {
      console.warn('reports 저장 예외:', err);
    }
  }

  async function handleDeleteReport(row) {
    try {
      const ok = window.confirm('이 보고서를 삭제하시겠습니까?');
      if (!ok) return;

      setError('');
      setMessage('');

      if (row.file_path) {
        localStorage.removeItem(row.file_path);
      }

      if (row.id && !String(row.id).startsWith('local-')) {
        const { error } = await supabase
          .from('reports')
          .delete()
          .eq('id', row.id);

        if (error) throw error;

        await insertSecurityAuditLog('delete_report', row.id, {
          report_name: row.report_name,
        });
      }

      setLocalRows((prev) => prev.filter((item) => item.id !== row.id));
      setRows((prev) => prev.filter((item) => item.id !== row.id));

      setMessage('보고서가 삭제되었습니다.');
    } catch (err) {
      console.error(err);
      setError(err.message || '보고서 삭제 실패');
    }
  }

  async function handleOpenPreview(row) {
    try {
      setPreviewRow(row);
      const latestPreview = await buildPreviewReportHtml(row);
      setPreviewHtml(latestPreview.html);
      setPreviewPayload(latestPreview);
      setPreviewOpen(true);
    } catch (err) {
      console.error(err);
      if (row?.file_path) {
        const stored = loadReportContentFromStorage(row.file_path);
        setPreviewHtml(stored?.html || '');
        setPreviewPayload(stored || null);
      } else {
        setPreviewHtml('');
        setPreviewPayload(null);
      }
      setPreviewOpen(true);
    }
  }

  function handlePreviewDownload() {
    if (!previewPayload?.html || !previewRow) return;

    const safeName = (previewRow.report_name || 'report').replace(/[\\/:*?"<>|]/g, '_');

    if (previewPayload.outputFormat === 'PDF') {
      openPrintWindow(previewPayload.html);
      return;
    }

    downloadTextFile(`${safeName}.html`, previewPayload.html);
  }

  async function handleGenerateReport() {
    try {
      setSaving(true);
      setMessage('');
      setError('');

      const resolvedReportName =
        (form.report_name || '').trim() ||
        (form.report_type === 'FULL'
          ? '전체 점검 결과 보고서'
          : form.report_type === 'VULN'
          ? '취약점 조치 현황 보고서'
          : form.report_type === 'ASSET'
          ? '자산별 상세 보고서'
          : '보안 점검 보고서');

      const [assetsRes, inspectionsRes, vulnsRes] = await Promise.all([
        supabase
          .from('assets')
          .select('id, asset_code, asset_type, hostname, ip_address'),
        supabase
          .from('inspection_results')
          .select(
            'id, target_id, asset_id, item_id, asset_code, asset_type, item_code, item_name, risk_level, result_status, result_text, checked_at, inspection_status, action_status, updated_at'
          )
          .order('updated_at', { ascending: false }),
        supabase
          .from('vulnerabilities')
          .select('*')
          .order('updated_at', { ascending: false }),
      ]);

      if (assetsRes.error) throw assetsRes.error;
      if (inspectionsRes.error) throw inspectionsRes.error;
      if (vulnsRes.error) throw vulnsRes.error;

      let assets = assetsRes.data || [];
      let inspections = inspectionsRes.data || [];
      let vulnerabilities = vulnsRes.data || [];

      if (form.asset_type !== 'ALL') {
        assets = assets.filter((row) => row.asset_type === form.asset_type);
        inspections = inspections.filter((row) => row.asset_type === form.asset_type);
      }

      if (form.include_only_vuln) {
        inspections = inspections.filter((row) => row.result_status === '취약');
      }

      const inspectionIds = Array.from(new Set(inspections.map((row) => row.id)));
      vulnerabilities = vulnerabilities.filter((row) => {
        if (!inspectionIds.length) return false;
        return inspectionIds.includes(row.inspection_result_id);
      });

      const vulnByInspectionId = Object.fromEntries(
        vulnerabilities.map((row) => [row.inspection_result_id, row])
      );

      let detailRows = inspections.map((row) => ({
        ...row,
        vuln_title: vulnByInspectionId[row.id]?.vuln_title || row.item_name,
        due_date: vulnByInspectionId[row.id]?.due_date || null,
      }));

      if (form.report_type === 'VULN') {
        detailRows = detailRows.filter((row) => row.result_status === '취약');
      }

      if (form.report_type === 'ASSET') {
        detailRows = detailRows.sort((a, b) => {
          const aCode = a.asset_code || '';
          const bCode = b.asset_code || '';
          return aCode.localeCompare(bCode);
        });
      }

      const assetTypeCountMap = assets.reduce((acc, row) => {
        const key = row.asset_type || 'ETC';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});

      const assetTypeRows = TYPE_OPTIONS.filter((row) => row.value !== 'ALL')
        .map((row) => ({
          label: row.label,
          count: assetTypeCountMap[row.value] || 0,
        }))
        .filter((row) => row.count > 0);

      const resultCountMap = detailRows.reduce((acc, row) => {
        const key = row.result_status || '미점검';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});

      const resultRows = ['양호', '취약', '예외', '재확인', '미점검'].map((label) => ({
        label,
        count: resultCountMap[label] || 0,
      }));

      const vulnerabilityRows = vulnerabilities.map((row) => {
        const matchedInspection = inspections.find(
          (inspection) => inspection.id === row.inspection_result_id
        );

        return {
          ...row,
          asset_code: matchedInspection?.asset_code || '-',
          asset_type: matchedInspection?.asset_type || '',
          item_code: matchedInspection?.item_code || '-',
          vuln_title: row.vuln_title || matchedInspection?.item_name || '-',
          risk_level: row.risk_level || matchedInspection?.risk_level || '-',
        };
      });

      const summary = {
        totalAssets: assets.length,
        totalInspections: detailRows.length,
        totalVuln: detailRows.filter((row) => row.result_status === '취약').length,
        inProgressVuln: vulnerabilityRows.filter((row) =>
          ['조치계획', '조치중', '검토중', 'OPEN', 'IN_PROGRESS'].includes(row.action_status)
        ).length,
      };

      const reportTypeText = resolveReportTypeText(
        form.report_type,
        form.include_only_vuln
      );
      const reportScope = resolveReportScopeText(
        form.asset_type,
        form.include_only_vuln,
        detailRows.length
      );

      const generatedAt = new Date();
      const safeName = resolvedReportName.replace(/[\\/:*?"<>|]/g, '_');

      const reportHtml = buildHtmlReport({
        meta: {
          reportName: resolvedReportName,
          reportTypeText,
          outputFormat: form.output_format,
          generatedAt: generatedAt.toISOString().slice(0, 16).replace('T', ' '),
          author: form.author_name,
          reportScope,
          assetTypeLabel:
            TYPE_OPTIONS.find((row) => row.value === form.asset_type)?.label || form.asset_type,
          includeOnlyVuln: form.include_only_vuln,
        },
        summary,
        assetTypeRows,
        resultRows,
        vulnerabilityRows,
        detailRows,
      });

      const tempStorageKey = getStorageKey(`temp-${Date.now()}`, generatedAt.toISOString());
      saveReportContentToStorage(tempStorageKey, {
        html: reportHtml,
        outputFormat: form.output_format,
        reportName: resolvedReportName,
      });

      if (form.output_format === 'PDF') {
        openPrintWindow(reportHtml);
      } else {
        downloadTextFile(`${safeName}.html`, reportHtml);
      }

      await saveReportHistory({
        reportName: resolvedReportName,
        reportTypeText,
        reportScope,
        generatedBy: form.author_name,
        outputFormat: form.output_format,
        storageKey: tempStorageKey,
      });

      setModalOpen(false);
      setMessage(
        form.output_format === 'PDF'
          ? '보고서를 생성했습니다. 인쇄 창에서 PDF로 저장하세요.'
          : '보고서를 생성했습니다. HTML 파일이 다운로드됩니다.'
      );
      fetchReports();
    } catch (err) {
      console.error(err);
      setError(err.message || '보고서 생성 실패');
    } finally {
      setSaving(false);
    }
  }

  function handleSearchSubmit(e) {
    e.preventDefault();
    setSearchKeyword(keyword);
  }

  const mergedReportRows = useMemo(() => {
    const combined = [...localRows, ...rows];
    const uniqueMap = new Map();

    combined.forEach((row) => {
      const key = `${row.report_name || ''}-${row.report_type || ''}-${row.generated_at || ''}`;
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, row);
      }
    });

    return Array.from(uniqueMap.values()).sort((a, b) => {
      const aTime = new Date(a.generated_at || a.created_at || 0).getTime();
      const bTime = new Date(b.generated_at || b.created_at || 0).getTime();
      return bTime - aTime;
    });
  }, [localRows, rows]);

  const filteredRows = useMemo(() => {
    const q = searchKeyword.trim().toLowerCase();

    return mergedReportRows.filter((row) => {
      if (!q) return true;
      return [row.report_name, row.report_type, row.report_scope]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [mergedReportRows, searchKeyword]);

  const kpis = useMemo(() => {
    const total = mergedReportRows.length;
    const fullCount = mergedReportRows.filter((row) => row.report_type === '전체').length;
    const vulnCount = mergedReportRows.filter((row) => row.report_type === '취약점만').length;

    return [
      { title: '전체 보고서', value: total, sub: '생성된 보고서 수' },
      { title: '전체 보고서', value: fullCount, sub: '점검 종합 결과' },
      { title: '취약점 보고서', value: vulnCount, sub: '취약 항목 중심' },
    ];
  }, [mergedReportRows]);

  return (
    <div className="space-y-4">
      <ReportModal
        open={modalOpen}
        form={form}
        saving={saving}
        onChange={handleFormChange}
        onClose={() => setModalOpen(false)}
        onGenerate={handleGenerateReport}
      />

      <PreviewModal
        open={previewOpen}
        row={previewRow}
        previewHtml={previewHtml}
        previewPayload={previewPayload}
        onClose={() => setPreviewOpen(false)}
        onDownload={handlePreviewDownload}
      />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
          title="보고서 관리"
          desc="점검 결과 및 취약점 조치 현황 보고서를 생성하고 이력을 관리합니다."
          action={
            <div className="flex w-full flex-col gap-2 xl:w-auto xl:flex-row xl:items-center">
              <form onSubmit={handleSearchSubmit} className="flex w-full gap-2 xl:w-auto">
                <input
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="보고서명 검색"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none placeholder:text-slate-400 xl:w-[300px]"
                />
                <button
                  type="submit"
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  검색
                </button>
              </form>

              <button
                onClick={openCreateModal}
                className="rounded-lg bg-slate-950 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
              >
                보고서 생성
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

        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-3 py-2 text-center font-bold whitespace-nowrap">보고서명</th>
                <th className="px-3 py-2 text-center font-bold whitespace-nowrap">생성일시</th>
                <th className="px-3 py-2 text-center font-bold whitespace-nowrap">관리</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={3} className="px-4 py-10 text-center text-slate-400">
                    보고서 목록을 불러오는 중입니다.
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-10 text-center text-slate-400">
                    표시할 보고서가 없습니다.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr
                    key={`${row.id}-${row.generated_at || row.created_at}`}
                    className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                    onClick={() => handleOpenPreview(row)}
                  >
                    <td className="px-3 py-2 text-center text-slate-700">
                      {row.report_name || '-'}
                    </td>
                    <td className="px-3 py-2 text-center whitespace-nowrap">
                      {formatDateTime(row.generated_at || row.created_at)}
                    </td>
                    <td
                      className="px-3 py-2 text-center whitespace-nowrap"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => handleDeleteReport(row)}
                        className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-50"
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
