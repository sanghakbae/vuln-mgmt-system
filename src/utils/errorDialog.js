function toText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function buildErrorDetails(error, options = {}) {
  const fallbackMessage = options.fallbackMessage || '알 수 없는 오류가 발생했습니다.';
  const normalizedError =
    error instanceof Error
      ? error
      : new Error(typeof error === 'string' ? error : fallbackMessage);

  const code = error?.code || error?.status || error?.statusCode || '';
  const details = error?.details || error?.detail || '';
  const hint = error?.hint || '';
  const context = options.context || '';
  const timestamp = new Date().toISOString();

  const summary = normalizedError.message || fallbackMessage;
  const lines = [
    `시간: ${timestamp}`,
    context ? `위치: ${context}` : '',
    code ? `코드: ${code}` : '',
    `메시지: ${summary}`,
    details ? `세부정보: ${toText(details)}` : '',
    hint ? `힌트: ${toText(hint)}` : '',
    normalizedError.stack ? `스택:\n${normalizedError.stack}` : '',
  ].filter(Boolean);

  return {
    title: options.title || '오류가 발생했습니다',
    summary,
    detailsText: lines.join('\n\n'),
    context,
    code: code ? String(code) : '',
    timestamp,
  };
}

export function openErrorDialog(detail) {
  if (typeof window === 'undefined') return;

  window.dispatchEvent(
    new CustomEvent('app:error', {
      detail,
    })
  );
}

export function reportAppError(error, options = {}) {
  const detail = buildErrorDetails(error, options);
  console.error(options.context || detail.title, error);

  if (typeof options.setError === 'function') {
    options.setError(detail.summary || options.fallbackMessage || detail.title);
  }

  openErrorDialog(detail);
  return detail;
}
