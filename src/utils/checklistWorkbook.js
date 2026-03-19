import * as XLSX from 'xlsx';

export const SHEET_TYPES = ['SERVER', 'DATABASE', 'WEB_APP', 'WAS', 'NETWORK', 'SECURITY', 'ETC'];

const HEADER_ALIASES = {
  '항목 코드': '항목코드',
  '점검항목명': '점검 항목명',
  '점검 방식': '점검방식',
  '사용 여부': '사용여부',
  '판정 기준': '판정기준',
  '조치 방안': '조치방안',
};

function normalizeHeader(header) {
  if (!header) return '';
  const cleaned = String(header).replace(/^\uFEFF/, '').trim().replace(/\s+/g, ' ');
  return HEADER_ALIASES[cleaned] || HEADER_ALIASES[cleaned.toLowerCase()] || cleaned;
}

function normalizeAssetType(value) {
  return String(value || '').trim().toUpperCase();
}

function emptyToString(value) {
  return String(value ?? '').trim();
}

function normalizeRow(rawRow) {
  const out = {};
  Object.keys(rawRow || {}).forEach((key) => {
    out[normalizeHeader(key)] = rawRow[key];
  });
  return out;
}

function validateEnum(value, allowed, context) {
  if (!allowed.includes(value)) {
    throw new Error(`${context} 값이 올바르지 않습니다: ${value}`);
  }
  return value;
}

export async function parseChecklistWorkbook(file) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const result = [];

  for (const sheetNameRaw of workbook.SheetNames) {
    const sheetName = normalizeAssetType(sheetNameRaw);
    if (!SHEET_TYPES.includes(sheetName)) continue;

    const sheet = workbook.Sheets[sheetNameRaw];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });

    rows.forEach((rawRow, idx) => {
      const rowNo = idx + 2;
      const row = normalizeRow(rawRow);
      const emptyRow = Object.values(row).every((v) => String(v ?? '').trim() === '');
      if (emptyRow) return;

      const itemCode = emptyToString(row['항목코드']);
      const itemName = emptyToString(row['점검 항목명']);
      const riskLevel = emptyToString(row['위험도'] || '중');
      const checkMethod = emptyToString(row['점검방식'] || '수동');
      const useYn = emptyToString(row['사용여부'] || '사용');

      if (!itemCode) {
        throw new Error(`${sheetName} ${rowNo}행 항목코드는 필수입니다.`);
      }
      if (!itemName) {
        throw new Error(`${sheetName} ${rowNo}행 점검 항목명은 필수입니다.`);
      }

      validateEnum(riskLevel, ['상', '중', '하'], `${sheetName} ${rowNo}행 위험도`);
      validateEnum(checkMethod, ['자동', '수동'], `${sheetName} ${rowNo}행 점검방식`);
      validateEnum(useYn, ['사용', '미사용'], `${sheetName} ${rowNo}행 사용여부`);

      result.push({
        item_code: itemCode,
        asset_type: sheetName,
        item_name: itemName,
        risk_level: riskLevel,
        check_method: checkMethod,
        use_yn: useYn,
        description: emptyToString(row['설명']),
        check_criteria: emptyToString(row['판정기준']),
        remediation: emptyToString(row['조치방안']),
      });
    });
  }

  return result;
}

export function exportChecklistWorkbook(rows = []) {
  const workbook = XLSX.utils.book_new();

  SHEET_TYPES.forEach((type) => {
    const filtered = rows.filter((row) => String(row.asset_type || '').trim().toUpperCase() === type);

    const data = filtered.map((row) => ({
      항목코드: row.item_code ?? '',
      '점검 항목명': row.item_name ?? '',
      위험도: row.risk_level ?? '',
      점검방식: row.check_method ?? '',
      사용여부: row.use_yn ?? '',
      설명: row.description ?? '',
      판정기준: row.check_criteria ?? '',
      조치방안: row.remediation ?? '',
    }));

    const sheet = XLSX.utils.json_to_sheet(
      data.length > 0
        ? data
        : [{
            항목코드: '',
            '점검 항목명': '',
            위험도: '',
            점검방식: '',
            사용여부: '',
            설명: '',
            판정기준: '',
            조치방안: '',
          }]
    );

    XLSX.utils.book_append_sheet(workbook, sheet, type);
  });

  XLSX.writeFile(workbook, '점검항목_설정.xlsx');
}