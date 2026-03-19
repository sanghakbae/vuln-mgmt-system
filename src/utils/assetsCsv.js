import Papa from 'papaparse';

const REQUIRED_HEADERS = [
  'Hostname',
  'IP Address',
  'OS 버전',
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
  '자산코드 ': '자산코드',
  hostname: 'Hostname',
  ' hostname': 'Hostname',
  'ip address': 'IP Address',
  ipaddress: 'IP Address',
  'OS버전': 'OS 버전',
  'os version': 'OS 버전',
  'os버전': 'OS 버전',
  '관련서비스': '관련 서비스',
  '담당 부서': '담당부서',
};

function normalizeHeader(header) {
  if (!header) return '';

  const cleaned = String(header)
    .replace(/^\uFEFF/, '')
    .replace(/\u0000/g, '')
    .trim()
    .replace(/\s+/g, ' ');

  return (
    HEADER_ALIASES[cleaned] ||
    HEADER_ALIASES[cleaned.toLowerCase()] ||
    cleaned
  );
}

function calcCriticality(confidentiality, integrity, availability) {
  const c = Number(confidentiality);
  const i = Number(integrity);
  const a = Number(availability);
  const score = c + i + a;

  let grade = '하';
  if (score >= 8) grade = '상';
  else if (score >= 5) grade = '중';

  return { score, grade };
}

function validateCiaValue(value, fieldName, rowIndex) {
  const num = Number(value);
  if (![1, 2, 3].includes(num)) {
    throw new Error(`${rowIndex}행 ${fieldName} 값은 1~3이어야 합니다.`);
  }
  return num;
}

async function readFileText(file) {
  const buffer = await file.arrayBuffer();

  for (const encoding of ['utf-8', 'euc-kr']) {
    try {
      const text = new TextDecoder(encoding, { fatal: false }).decode(buffer);
      if (text && (text.includes('Hostname') || text.includes('자산코드'))) {
        return text;
      }
    } catch {
      // ignore
    }
  }

  return new TextDecoder('utf-8').decode(buffer);
}

export async function parseAssetsCsv(file) {
  const text = await readFileText(file);

  const parsed = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
  });

  if (parsed.errors?.length) {
    throw new Error(`CSV 파싱 실패: ${parsed.errors[0].message}`);
  }

  const rawHeaders = parsed.meta.fields || [];
  const normalizedHeaders = rawHeaders.map(normalizeHeader);

  const headerMap = {};
  rawHeaders.forEach((raw, idx) => {
    headerMap[normalizedHeaders[idx]] = raw;
  });

  const missingHeaders = REQUIRED_HEADERS.filter(
    (header) => !normalizedHeaders.includes(header)
  );

  if (missingHeaders.length > 0) {
    throw new Error(`필수 헤더 누락: ${missingHeaders.join(', ')}`);
  }

  return parsed.data
    .filter((rawRow) =>
      Object.values(rawRow || {}).some((value) => String(value || '').trim() !== '')
    )
    .map((rawRow, index) => {
      const row = {};
      for (const normalizedHeader of [...OPTIONAL_HEADERS, ...REQUIRED_HEADERS]) {
        const rawHeader = headerMap[normalizedHeader];
        row[normalizedHeader] = rawHeader ? rawRow[rawHeader] : '';
      }

      const confidentiality = validateCiaValue(row['기밀성'], '기밀성', index + 2);
      const integrity = validateCiaValue(row['무결성'], '무결성', index + 2);
      const availability = validateCiaValue(row['가용성'], '가용성', index + 2);

      const { score, grade } = calcCriticality(
        confidentiality,
        integrity,
        availability
      );

      return {
        asset_code: String(row['자산코드'] || '').trim() || null,
        hostname: String(row['Hostname'] || '').trim(),
        ip_address: String(row['IP Address'] || '').trim(),
        os_version: String(row['OS 버전'] || '').trim(),
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
      };
    });
}

export function exportAssetsCsv(rows = []) {
  const headers = [
    '자산코드',
    'Hostname',
    'IP Address',
    'OS 버전',
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

  const escapeCsv = (value) => {
    const str = value == null ? '' : String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const lines = [
    headers.join(','),
    ...rows.map((row) =>
      [
        row.asset_code ?? '',
        row.hostname ?? '',
        row.ip_address ?? '',
        row.os_version ?? '',
        row.related_service ?? '',
        row.purpose ?? '',
        row.location ?? '',
        row.department ?? '',
        row.owner_name ?? '',
        row.manager_name ?? '',
        row.confidentiality ?? '',
        row.integrity ?? '',
        row.availability ?? '',
      ]
        .map(escapeCsv)
        .join(',')
    ),
  ];

  const csvContent = '\uFEFF' + lines.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = '정보자산.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}