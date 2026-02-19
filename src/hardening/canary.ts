// src/hardening/canary.ts (stub -- implemented fully in Task 2)
export function setupCanary(_adapter: unknown, _audit: unknown): { isVerified: () => boolean; markVerified: () => void } {
  let verified = false;
  return { isVerified: () => verified, markVerified: () => { verified = true; } };
}
