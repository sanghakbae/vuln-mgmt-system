import * as XLSX from 'xlsx';

const SHEET_TYPES = ['SERVER', 'DATABASE', 'WEB_APP', 'WAS', 'NETWORK', 'SECURITY', 'ETC'];

const REQUIRED_HEADERS = [
  'Hostname',
  'IP Address',
  '버전',
  '관련 서비스',
  '용도',
  '위치',
  '담당부서',
  '담당자',
  '관리자',
  '기밀성',
  '무결성',
  '가용성',
];

const OPTIONAL_HEADERS = ['자산코드'];

const HEADER_ALIASES = {
  '자산 코드': '자산코드',
  '관련서비스': '관련 서비스',
  'OS 버전': '버전',
  'OS버전': '버전',
  '담당 부서': '담당부서',
  hostname: 'Hostname',
  'ip address': 'IP Address',
  ipaddress: 'IP Address',
};

function normalizeHeader(header) {
  if (!header) return '';
  const cleaned = String(header)
    .replace(/^\uFEFF/, '')
    .trim()
    .replace(/\s+/g, ' ');
  return HEADER_ALIASES[cleaned] || HEADER_ALIASES[cleaned.toLowerCase()] || cleaned;
}

function validateCiaValue(value, fieldName, context) {
  const num = Number(value);
  if (![1, 2, 3].includes(num)) {
    throw new Error(`${context} ${fieldName} 값은 1~3이어야 합니다.`);
  }
  return num;
}

function calcCriticality(confidentiality, integrity, availability) {
  const score = Number(confidentiality) + Number(integrity) + Number(availability);
  let grade = '하';
  if (score >= 8) grade = '상';
  else if (score >= 5) grade = '중';
  return { score, grade };
}

function normalizeRowByHeaders(rawRow, headers) {
  const out = {};
  Object.keys(rawRow).forEach((key) => {
    out[normalizeHeader(key)] = rawRow[key];
  });

  headers.forEach((header) => {
    if (!(header in out)) out[header] = '';
  });

  return out;
}

function normalizeAssetType(value) {
  const normalized = String(value || '').trim().toUpperCase();

  if (normalized === '서버시스템') return 'SERVER';
  if (normalized === '데이터베이스') return 'DATABASE';
  if (normalized === '웹애플리케이션') return 'WEB_APP';
  if (normalized === '네트워크장비') return 'NETWORK';
  if (normalized === '보안솔루션') return 'SECURITY';
  if (normalized === '기타') return 'ETC';

  return normalized;
}

export async function parseAssetsWorkbook(file) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });

  const rows = [];

  for (const sheetName of workbook.SheetNames) {
    if (!SHEET_TYPES.includes(sheetName)) continue;

    const sheet = workbook.Sheets[sheetName];
    const json = XLSX.utils.sheet_to_json(sheet, {
      defval: '',
      raw: false,
    });

    for (let i = 0; i < json.length; i += 1) {
      const rawRow = json[i];
      const row = normalizeRowByHeaders(rawRow, [...OPTIONAL_HEADERS, ...REQUIRED_HEADERS]);

      const missingHeaders = REQUIRED_HEADERS.filter((header) => !(header in row));
      if (missingHeaders.length > 0) {
        throw new Error(`${sheetName} 시트 필수 헤더 누락: ${missingHeaders.join(', ')}`);
      }

      const emptyRow = Object.values(row).every((value) => String(value ?? '').trim() === '');
      if (emptyRow) continue;

      const confidentiality = validateCiaValue(row['기밀성'], '기밀성', `${sheetName} ${i + 2}행`);
      const integrity = validateCiaValue(row['무결성'], '무결성', `${sheetName} ${i + 2}행`);
      const availability = validateCiaValue(row['가용성'], '가용성', `${sheetName} ${i + 2}행`);

      const { score, grade } = calcCriticality(confidentiality, integrity, availability);

      rows.push({
        asset_code: String(row['자산코드'] || '').trim() || null,
        asset_type: normalizeAssetType(sheetName),
        hostname: String(row['Hostname'] || '').trim(),
        ip_address: String(row['IP Address'] || '').trim(),
        os_version: String(row['버전'] || '').trim(),
        related_service: String(row['관련 서비스'] || '').trim(),
        purpose: String(row['용도'] || '').trim(),
        location: String(row['위치'] || '').trim(),
        department: String(row['담당부서'] || '').trim(),
        owner_name: String(row['담당자'] || '').trim(),
        manager_name: String(row['관리자'] || '').trim(),
        confidentiality,
        integrity,
        availability,
        criticality_score: score,
        criticality_grade: grade,
      });
    }
  }

  return rows;
}

export function exportAssetsWorkbook(rows = []) {
  const workbook = XLSX.utils.book_new();

  SHEET_TYPES.forEach((type) => {
    const filtered = rows.filter((row) => normalizeAssetType(row.asset_type) === type);

    const data = filtered.map((row) => ({
      자산코드: row.asset_code ?? '',
      Hostname: row.hostname ?? '',
      'IP Address': row.ip_address ?? '',
      버전: row.os_version ?? '',
      '관련 서비스': row.related_service ?? '',
      용도: row.purpose ?? '',
      위치: row.location ?? '',
      담당부서: row.department ?? '',
      담당자: row.owner_name ?? '',
      관리자: row.manager_name ?? '',
      기밀성: row.confidentiality ?? '',
      무결성: row.integrity ?? '',
      가용성: row.availability ?? '',
    }));

    const sheet = XLSX.utils.json_to_sheet(
      data.length > 0
        ? data
        : [
            {
              자산코드: '',
              Hostname: '',
              'IP Address': '',
              버전: '',
              '관련 서비스': '',
              용도: '',
              위치: '',
              담당부서: '',
              담당자: '',
              관리자: '',
              기밀성: '',
              무결성: '',
              가용성: '',
            },
          ]
    );

    XLSX.utils.book_append_sheet(workbook, sheet, type);
  });

  XLSX.writeFile(workbook, '정보자산_목록.xlsx');
}