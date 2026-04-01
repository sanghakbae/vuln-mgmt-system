import { supabase } from '../lib/supabase';

export const ASSET_SELECT_COLUMNS = [
  'id',
  'asset_code',
  'asset_type',
  'hostname',
  'ip_address',
  'os_version',
  'related_service',
  'purpose',
  'location',
  'department',
  'owner_name',
  'manager_name',
  'confidentiality',
  'integrity',
  'availability',
  'criticality_score',
  'criticality_grade',
  'status',
  'updated_at',
].join(', ');

function inferAssetType(row) {
  const explicitType = String(row?.asset_type || '').trim().toUpperCase();
  if (explicitType) return explicitType;

  const code = String(row?.asset_code || '').trim().toUpperCase();

  if (code.startsWith('SRV-')) return 'SERVER';
  if (code.startsWith('DB-')) return 'DATABASE';
  if (code.startsWith('WEB-')) return 'WEB_APP';
  if (code.startsWith('WAS-')) return 'WAS';
  if (code.startsWith('NW-')) return 'NETWORK';
  if (code.startsWith('SEC-')) return 'SECURITY';
  return 'ETC';
}

function normalizeAssetRow(row) {
  return {
    ...row,
    asset_type: inferAssetType(row),
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

export async function fetchAssets() {
  if (!supabase) return [];
  const data = await selectAssetsWithFallback();
  return data.map(normalizeAssetRow);
}

export async function upsertAssets(rows) {
  if (!supabase) {
    return { data: rows || [], mock: true };
  }

  const { data, error } = await supabase
    .from('assets')
    .upsert(rows, { onConflict: 'asset_code' })
    .select();

  if (error) throw error;
  return { data: data || [] };
}
