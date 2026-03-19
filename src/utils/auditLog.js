import { supabase } from '../lib/supabase';

export async function writeAuditLog({
  userEmail = 'admin@muhayou.com',
  actionType,
  menuName,
  targetType,
  targetId,
  actionDetail,
}) {
  if (!supabase) return;

  const { error } = await supabase.rpc('write_audit_log', {
    p_user_email: userEmail,
    p_action_type: actionType,
    p_menu_name: menuName,
    p_target_type: targetType,
    p_target_id: String(targetId ?? ''),
    p_action_detail: actionDetail ?? '',
  });

  if (error) {
    console.error('audit log write failed:', error);
  }
}