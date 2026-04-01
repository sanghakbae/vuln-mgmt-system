export const DEFAULT_ALLOWED_DOMAINS = ['muhayu.com', 'gmail.com'];
export const DEFAULT_ALLOWED_DOMAINS_TEXT = DEFAULT_ALLOWED_DOMAINS.join(',');
export const ROLE_OPTIONS = ['admin', 'auditor', 'user', 'viewer'];

const BOOTSTRAP_ADMIN_EMAILS = ['shbae@muhayu.com'];
const AUDIT_MENUS = new Set(['audit']);
const ADMIN_MENUS = new Set(['security', 'access']);

export function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function isBootstrapAdminEmail(email) {
  return BOOTSTRAP_ADMIN_EMAILS.includes(normalizeEmail(email));
}

export function parseAllowedDomains(value) {
  return String(value || DEFAULT_ALLOWED_DOMAINS_TEXT)
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export function resolveUserRole(role, email) {
  const normalizedRole = String(role || '').trim().toLowerCase();

  if (ROLE_OPTIONS.includes(normalizedRole)) {
    return normalizedRole;
  }

  return isBootstrapAdminEmail(email) ? 'admin' : 'viewer';
}

export function isAdminUser(email, role) {
  return resolveUserRole(role, email) === 'admin';
}

export function isAuditorUser(email, role) {
  return resolveUserRole(role, email) === 'auditor';
}

export function canViewAuditLogs(email, role) {
  const resolvedRole = resolveUserRole(role, email);
  return resolvedRole === 'admin' || resolvedRole === 'auditor';
}

export function canManageSecuritySettings(email, role) {
  return resolveUserRole(role, email) === 'admin';
}

export function canManageUsers(email, role) {
  return resolveUserRole(role, email) === 'admin';
}

export function canEditWorkflowData(email, role) {
  const resolvedRole = resolveUserRole(role, email);
  return resolvedRole === 'admin' || resolvedRole === 'user';
}

export function canConfirmWorkflow(email, role) {
  return resolveUserRole(role, email) === 'admin';
}

export function canGenerateReports(email, role) {
  const resolvedRole = resolveUserRole(role, email);
  return resolvedRole === 'admin' || resolvedRole === 'auditor';
}

export function canDeleteReports(email, role) {
  return resolveUserRole(role, email) === 'admin';
}

export function getRoleLabel(role, email) {
  const resolvedRole = resolveUserRole(role, email);

  if (resolvedRole === 'admin') return 'admin';
  if (resolvedRole === 'auditor') return 'Auditor';
  if (resolvedRole === 'user') return 'User';
  return 'Viewer';
}

export function canAccessMenu(menuKey, email, role) {
  const resolvedRole = resolveUserRole(role, email);

  if (ADMIN_MENUS.has(menuKey)) {
    return resolvedRole === 'admin';
  }

  if (AUDIT_MENUS.has(menuKey)) {
    return resolvedRole === 'admin' || resolvedRole === 'auditor';
  }

  return true;
}
