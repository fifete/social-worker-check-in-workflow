export const normalizeText = (str = '') =>
  String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();

export function executeSearch(query, visitorList = []) {
  const trimmedQuery = String(query ?? '').trim();

  if (trimmedQuery.length === 0) {
    return { status: 'IDLE', data: [] };
  }

  if (trimmedQuery.length > 0 && trimmedQuery.length < 3) {
    return {
      status: 'THRESHOLD_WARNING',
      message: 'Escriba al menos 3 caracteres...',
      data: [],
    };
  }

  const normalizedQuery = normalizeText(trimmedQuery);

  const matches = visitorList.filter((visitor) => {
    const normalizedName = normalizeText(visitor?.visitorName ?? '');
    const normalizedId = normalizeText(visitor?.visitorId ?? '');

    return normalizedName.includes(normalizedQuery) || normalizedId.includes(normalizedQuery);
  });

  if (matches.length > 15) {
    return {
      status: 'OVERFLOW_WARNING',
      message: '⚠️ Demasiados resultados encontrados. Por favor, siga escribiendo para filtrar con mayor precisión.',
      data: [],
    };
  }

  return { status: 'SUCCESS', data: matches };
}
