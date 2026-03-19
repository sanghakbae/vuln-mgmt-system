import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const url = env.match(/VITE_SUPABASE_URL=(.*)/)?.[1]?.trim();
const key = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/)?.[1]?.trim();

if (!url || !key) {
  throw new Error('Supabase env is missing.');
}

const supabase = createClient(url, key);

function cleanSentence(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.。]+$/g, '');
}

function extractDescriptionBase(row) {
  let text = cleanSentence(row.description);
  const escapedName = row.item_name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const prefixPattern = new RegExp(`^${escapedName} 항목입니다\\. 이 점검은\\s*`);
  while (prefixPattern.test(text)) {
    text = text.replace(prefixPattern, '').trim();
  }

  text = text.replace(new RegExp(`^${escapedName} 항목입니다\\.\\s*`), '').trim();

  const wrappedPattern =
    /^이 항목은 "([\s\S]+)" 내용을 실제 운영 환경에서 적절히 적용하고 있는지 확인하기 위한 점검입니다(?:\. 설정값만 보는 것이 아니라 현재 사용 방식과 예외 여부까지 함께 확인합니다)?$/;
  while (wrappedPattern.test(text)) {
    text = text.match(wrappedPattern)?.[1] || text;
    text = cleanSentence(text);
  }

  const marker = '항목이 실제 운영 환경에서 적절히 적용되어 있는지 확인하기 위한 것입니다';
  if (text.includes(marker)) {
    text = text.split(marker)[0];
  }

  text = text
    .replace(/^이 점검은\s*/g, '')
    .replace(/^이 항목은\s*/g, '')
    .replace(/^"|"$/g, '')
    .replace(/[를을]$/g, '')
    .replace(/\s*항목$/g, '')
    .replace(/\s*점검 항목$/g, '')
    .replace(/\s*점검입니다$/g, '')
    .replace(/\s*점검$/g, '');

  return cleanSentence(text) || `${row.item_name} 설정 및 운영 상태를 점검`;
}

function extractCriteriaBase(row) {
  let text = cleanSentence(row.check_criteria);
  text = text.replace(/^(양호 기준:\s*)+/g, '');

  const marker = '관련 설정 파일, 관리 화면, 실행 결과 또는 로그를 통해 실제 적용 여부를 확인하고, 예외 사유가 있다면 근거 문서를 함께 확인합니다';
  if (text.includes(marker)) {
    text = text.split(marker)[0];
  }

  text = text
    .replace(/\s*양호 상태이면 양호합니다/g, '')
    .replace(/\s*상태이면 양호합니다$/g, '')
    .replace(/\s*입니다$/g, '')
    .replace(/\s*\.$/g, '');

  return cleanSentence(text) || '보안 기준이 충족되면 양호';
}

function extractRemediationBase(row) {
  let text = cleanSentence(row.remediation);
  text = text.replace(/^(미흡 시 조치:\s*)+/g, '');

  const marker = '합니다. 조치 후에는 서비스 영향 여부를 확인하고, 동일한 문제가 다시 발생하지 않도록 운영 절차나 정책에도 반영합니다';
  if (text.includes(marker)) {
    text = text.split(marker)[0];
  }

  const marker2 = '조치 후에는 서비스 영향 여부를 확인하고, 동일한 문제가 다시 발생하지 않도록 운영 절차나 정책에도 반영합니다';
  if (text.includes(marker2)) {
    text = text.split(marker2)[0];
  }

  text = text
    .replace(/\s*조치를 수행합니다/g, '')
    .replace(/\s*조치를 수행/g, '')
    .replace(/\s*합니다$/g, '')
    .replace(/\s*\.$/g, '');

  return cleanSentence(text) || '보안 설정을 기준에 맞게 조정';
}

function buildDescription(row) {
  return `${row.item_name} 항목입니다. 이 항목은 ${row.item_name} 관련 보안 설정과 운영 상태를 이해하기 쉽게 확인하기 위한 점검입니다. 설정값만 보는 것이 아니라 현재 사용 방식과 예외 여부까지 함께 확인합니다.`;
}

function buildCriteria(row) {
  return `양호 기준: ${row.item_name} 관련 보안 설정이 기준에 맞게 적용되어 있어야 하며, 예외가 있다면 사유와 승인 근거를 확인할 수 있어야 합니다. 관련 설정 파일, 관리 화면, 실행 결과 또는 로그를 통해 실제 적용 여부를 확인합니다.`;
}

function buildRemediation(row) {
  return `미흡 시 조치: ${row.item_name} 관련 설정을 보안 기준에 맞게 수정하고, 불필요하거나 위험한 구성은 제거하거나 제한합니다. 조치 후에는 서비스 영향 여부를 확인하고, 동일한 문제가 다시 발생하지 않도록 운영 절차나 정책에도 반영합니다.`;
}

const { data, error } = await supabase
  .from('check_items')
  .select('id,item_code,item_name,description,check_criteria,remediation')
  .order('item_code', { ascending: true });

if (error) {
  throw error;
}

const updates = (data || []).map((row) => ({
  id: row.id,
  item_code: row.item_code,
  description: buildDescription(row),
  check_criteria: buildCriteria(row),
  remediation: buildRemediation(row),
  updated_at: new Date().toISOString(),
}));

for (const row of updates) {
  const { error: updateError } = await supabase
    .from('check_items')
    .update({
      description: row.description,
      check_criteria: row.check_criteria,
      remediation: row.remediation,
      updated_at: row.updated_at,
    })
    .eq('id', row.id);

  if (updateError) {
    throw new Error(`${row.item_code}: ${updateError.message}`);
  }
}

console.log(
  JSON.stringify(
    {
      updatedCount: updates.length,
      preview: updates.slice(0, 5),
    },
    null,
    2
  )
);
