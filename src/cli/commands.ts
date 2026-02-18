import type { CareAgentPluginAPI } from '../adapter/types.js';
import type { AuditPipeline } from '../audit/pipeline.js';
import { createTerminalIO } from './io.js';
import { runInitCommand } from './init-command.js';
import { runStatusCommand } from './status-command.js';

export function registerCLI(
  adapter: CareAgentPluginAPI,
  workspacePath: string,
  audit: AuditPipeline,
): void {
  adapter.registerCliCommand({
    name: 'careagent init',
    description: 'Initialize CareAgent with a clinical onboarding interview',
    handler: async () => {
      const io = createTerminalIO();
      await runInitCommand(io, workspacePath, audit);
    },
  });

  adapter.registerCliCommand({
    name: 'careagent status',
    description: 'Show CareAgent activation state and system health',
    handler: () => {
      runStatusCommand(workspacePath);
    },
  });
}
