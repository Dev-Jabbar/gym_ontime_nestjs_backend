// A trainer profile row holds personal data the app has no reason to show
// everyone. Date of birth is visible to admins only; a trainer sees their own
// through /trainers/me, which is not filtered. The phone number stays visible
// to logged-in users (the class details modal shows it), and the trainer
// routes require login.
export function forViewer<T extends Record<string, any>>(
  profile: T,
  viewerRole: string,
): T {
  if (viewerRole === 'admin') return profile;
  const { dateOfBirth: _hidden, ...rest } = profile;
  return rest as T;
}
