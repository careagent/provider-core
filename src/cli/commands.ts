import type { CareAgentPluginAPI } from '../adapter/types.js';
import type { AuditPipeline } from '../audit/pipeline.js';

export function registerCLI(
  adapter: CareAgentPluginAPI,
  _workspacePath: string,
  _audit: AuditPipeline,
): void {
  adapter.registerCliCommand({
    name: 'careagent init',
    description: 'Initialize CareAgent with a clinical onboarding interview',
    handler: async () => {
      console.log('[CareAgent] careagent init — not yet wired. Coming in Plan 06.');
    },
  });

  adapter.registerCliCommand({
    name: 'careagent status',
    description: 'Show CareAgent activation state and system health',
    handler: async () => {
      console.log('[CareAgent] careagent status — not yet wired. Coming in Plan 06.');
    },
  });
}
