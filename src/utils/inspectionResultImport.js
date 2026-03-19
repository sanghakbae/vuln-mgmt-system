function mapResultStatus(value) {
  const normalized = String(value || '').trim().toLowerCase();

  if (['weak', 'vulnerable', 'bad', 'fail', 'failed', '취약'].includes(normalized)) {
    return '취약';
  }

  if (['good', 'safe', 'pass', 'passed', 'ok', '양호'].includes(normalized)) {
    return '양호';
  }

  if (
    [
      'info',
      'interview',
      'manual',
      'check',
      'n/a',
      'na',
      'notapplicable',
      'not applicable',
      'unknown',
      '예외',
      '재확인',
    ].includes(normalized)
  ) {
    return '재확인';
  }

  return '미점검';
}

function detectAssetTypeFromFileName(fileName = '') {
  const upper = String(fileName || '').toUpperCase();

  if (upper.includes('LINUX') || upper.includes('UNIX')) return 'SERVER';

  if (
    upper.includes('NGINX') ||
    upper.includes('APACHE') ||
    upper.includes('WEBTOB') ||
    upper.includes('TOMCAT') ||
    upper.includes('JBOSS') ||
    upper.includes('JEUS') ||
    upper.includes('WAS')
  ) {
    return 'WAS';
  }

  if (
    upper.includes('POSTGRES') ||
    upper.includes('POSTGRESQL') ||
    upper.includes('MYSQL') ||
    upper.includes('MARIADB') ||
    upper.includes('ORACLE') ||
    upper.includes('MSSQL') ||
    upper.includes('DB2') ||
    upper.includes('DATABASE') ||
    upper.includes('DB_')
  ) {
    return 'DATABASE';
  }

  if (upper.includes('WEB')) return 'WEB_APP';

  return '';
}

function detectAssetTypeFromRows(rows = []) {
  const codes = rows.map((row) => String(row.source_item_code || '').toUpperCase());

  if (codes.some((code) => /^U-\d+$/i.test(code))) return 'SERVER';
  if (codes.some((code) => /^(WA|NG)-\d+$/i.test(code))) return 'WAS';
  if (codes.some((code) => /^(DY|DP)-\d+$/i.test(code))) return 'DATABASE';

  return '';
}

function extractAssetCodeFromFileName(fileName = '') {
  const normalized = String(fileName || '').replace(/\.[^/.]+$/, '');
  const match = normalized.match(
    /\b(SRV-\d+|DB-\d+|WEB-\d+|WAS-\d+|NW-\d+|SEC-\d+|ETC-\d+)\b/i
  );

  return match ? match[1].toUpperCase() : '';
}

function extractHostnameFromFileName(fileName = '') {
  const normalized = String(fileName || '').replace(/\.[^/.]+$/, '');
  const parts = normalized.split(/[_\s]+/).filter(Boolean);

  const candidates = parts.filter(
    (part) =>
      !/^(SRV-\d+|DB-\d+|WEB-\d+|WAS-\d+|NW-\d+|SEC-\d+|ETC-\d+)$/i.test(part) &&
      !/^\d{8,14}$/.test(part) &&
      !/^(LINUX|UNIX|NGINX|APACHE|WEBTOB|TOMCAT|JBOSS|JEUS|POSTGRES|POSTGRESQL|MYSQL|MARIADB|ORACLE|MSSQL|DB2|DATABASE|RESULT|CHECK|CCE|TXT|XML)$/i.test(
        part
      ) &&
      !/^(?:\d{1,3}\.){3}\d{1,3}$/.test(part)
  );

  return candidates.length ? candidates[candidates.length - 1] : '';
}

function extractHostnameFromText(text = '') {
  const patterns = [
    /<<\s*hostname\s*>>\s*([^\r\n]+)/i,
    /(?:HOSTNAME|Hostname|host_name|Host Name)\s*[:=]\s*([^\r\n]+)/i,
    /점검\s*대상\s*[:=]\s*([^\r\n]+)/i,
  ];

  for (const pattern of patterns) {
    const match = String(text).match(pattern);
    if (match?.[1]) return match[1].trim();
  }

  return '';
}

function extractIpAddress(text = '') {
  const match = String(text).match(
    /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/
  );
  return match ? match[0] : '';
}

function normalizeSourceCode(code = '') {
  return String(code || '').trim().toUpperCase();
}

function normalizeBlockCode(code = '') {
  const normalized = normalizeSourceCode(code);
  if (/^[A-Z]{1,3}-\d+$/i.test(normalized)) return normalized;
  return '';
}

function buildResultText(comment = '', checkText = '') {
  return String(checkText || '').trim()
    ? `[Check]\n${String(checkText).trim()}`
    : '';
}

function buildRawResult(dataText = '', comment = '', checkText = '') {
  return String(comment || '').trim()
    ? `[Comment]\n${String(comment).trim()}`
    : '';
}

function parseXmlStyleResult(text) {
  const rows = [];
  const blockRegex = /<([A-Z]{1,3}-\d+)>([\s\S]*?)<\/\1>/gi;
  let blockMatch;

  while ((blockMatch = blockRegex.exec(text)) !== null) {
    const sourceItemCode = normalizeBlockCode(blockMatch[1]);
    if (!sourceItemCode) continue;

    const blockBody = blockMatch[2] || '';
    const resultMatch = blockBody.match(/<Result>([\s\S]*?)<\/Result>/i);
    const commentMatch = blockBody.match(/<Comment>([\s\S]*?)<\/Comment>/i);
    const dataMatch = blockBody.match(/<DATA>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/DATA>/i);
    const checkMatch = blockBody.match(/\[Check\]\s*:\s*([\s\S]*?)(?:={5,}|$)/i);

    const resultValue = (resultMatch?.[1] || '').trim();
    const comment = (commentMatch?.[1] || '').trim();
    const dataText = (dataMatch?.[1] || '').trim();
    const checkText = (checkMatch?.[1] || '').trim();

    rows.push({
      source_item_code: sourceItemCode,
      result_status: mapResultStatus(resultValue),
      result_text: buildResultText(comment, checkText),
      raw_result: buildRawResult(dataText, comment, checkText),
    });
  }

  return rows;
}

function parseTextStyleResult(text) {
  const rows = [];
  const lines = String(text).split(/\r?\n/);

  let currentCode = '';
  let currentResult = '';
  let currentCommentLines = [];
  let currentCheckLines = [];
  let currentData = [];
  let mode = '';

  const flush = () => {
    if (!currentCode) return;

    const commentText = currentCommentLines.join('\n').trim();
    const checkText = currentCheckLines.join('\n').trim();
    const dataText = currentData.join('\n').trim();

    rows.push({
      source_item_code: normalizeSourceCode(currentCode),
      result_status: mapResultStatus(currentResult),
      result_text: buildResultText(commentText, checkText),
      raw_result: buildRawResult(dataText, commentText, checkText),
    });

    currentCode = '';
    currentResult = '';
    currentCommentLines = [];
    currentCheckLines = [];
    currentData = [];
    mode = '';
  };

  for (const line of lines) {
    const trimmed = line.trim();

    const idMatch = trimmed.match(/^\[ID\]\s*:\s*([A-Z]{1,3}-\d+)$/i);
    if (idMatch) {
      flush();
      currentCode = normalizeBlockCode(idMatch[1]);
      continue;
    }

    const codeOnlyMatch = trimmed.match(/^([A-Z]{1,3}-\d+)$/i);
    if (codeOnlyMatch) {
      const normalizedCode = normalizeBlockCode(codeOnlyMatch[1]);
      if (normalizedCode) {
        flush();
        currentCode = normalizedCode;
        continue;
      }
    }

    const resultMatch = trimmed.match(/^\[Result\]\s*:\s*(.*)$/i);
    if (resultMatch) {
      currentResult = resultMatch[1].trim();
      mode = '';
      continue;
    }

    const commentMatch = trimmed.match(/^\[Comment\]\s*:\s*(.*)$/i);
    if (commentMatch) {
      currentCommentLines = [];
      if (commentMatch[1]?.trim()) {
        currentCommentLines.push(commentMatch[1].trim());
      }
      mode = 'comment';
      continue;
    }

    const checkMatch = trimmed.match(/^\[Check\]\s*:?\s*(.*)$/i);
    if (checkMatch) {
      currentCheckLines = [];
      if (checkMatch[1]?.trim()) {
        currentCheckLines.push(checkMatch[1].trim());
      }
      mode = 'check';
      continue;
    }

    if (/^\[DATA\]/i.test(trimmed) || /^<DATA>/i.test(trimmed) || /^\[RAW\]/i.test(trimmed)) {
      mode = 'data';
      continue;
    }

    if (/^<\/DATA>/i.test(trimmed)) {
      mode = '';
      continue;
    }

    if (/^={5,}$/.test(trimmed)) {
      mode = '';
      continue;
    }

    if (mode === 'comment') {
      currentCommentLines.push(line);
      continue;
    }

    if (mode === 'check') {
      currentCheckLines.push(line);
      continue;
    }

    if (mode === 'data') {
      currentData.push(line);
      continue;
    }
  }

  flush();
  return rows;
}

function deduplicateRows(rows = []) {
  const map = new Map();

  for (const row of rows) {
    const code = normalizeSourceCode(row.source_item_code);
    if (!code) continue;

    map.set(code, {
      source_item_code: code,
      result_status: row.result_status || '미점검',
      result_text: row.result_text || '',
      raw_result: row.raw_result || '',
    });
  }

  return Array.from(map.values());
}

export async function parseInspectionResultFile(file) {
  const text = await file.text();
  const fileName = file?.name || '';

  let rows = parseXmlStyleResult(text);

  if (!rows.length) {
    rows = parseTextStyleResult(text);
  }

  rows = deduplicateRows(rows);

  const assetCode = extractAssetCodeFromFileName(fileName);
  const hostnameFromFile = extractHostnameFromFileName(fileName);
  const hostnameFromText = extractHostnameFromText(text);
  const hostname = hostnameFromText || hostnameFromFile;
  const ipAddress = extractIpAddress(text);

  const detectedAssetTypeFromFile = detectAssetTypeFromFileName(fileName);
  const detectedAssetTypeFromRows = detectAssetTypeFromRows(rows);
  const detectedAssetType = detectedAssetTypeFromRows || detectedAssetTypeFromFile;

  return {
    file_name: fileName,
    asset_code: assetCode,
    hostname,
    ip_address: ipAddress,
    detected_asset_type: detectedAssetType,
    rows,
  };
}