/**
 * Re-export shim — adapter implementation now lives in src/adapters/openclaw/index.ts.
 * This file preserves backward compatibility for existing imports.
 * @deprecated Import from '../adapters/openclaw/index.js' instead.
 */
export { createAdapter } from '../adapters/openclaw/index.js';
