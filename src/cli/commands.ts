import type { PlatformAdapter } from '../adapters/types.js';
import type { AuditPipeline } from '../audit/pipeline.js';
import type { WorkspaceProfile } from '../onboarding/workspace-profiles.js';
import { createTerminalIO } from './io.js';
import { runInitCommand } from './init-command.js';
import { runStatusCommand } from './status-command.js';
import { runActivateCommand } from './activate-command.js';
import { runDeactivateCommand } from './deactivate-command.js';
import { runUninstallCommand } from './uninstall-command.js';

export function registerCLI(
  adapter: PlatformAdapter,
  workspacePath: string,
  audit: AuditPipeline,
  profile?: WorkspaceProfile,
): void {
  adapter.registerCliCommand({
    name: 'careagent init',
    description: 'Initialize CareAgent with a clinical onboarding interview',
    handler: async () => {
      const io = createTerminalIO();
      await runInitCommand(io, workspacePath, audit, profile);
    },
  });

  adapter.registerCliCommand({
    name: 'careagent status',
    description: 'Show CareAgent activation state and system health',
    handler: () => {
      runStatusCommand(workspacePath);
    },
  });

  adapter.registerCliCommand({
    name: 'careagent activate',
    description: 'Activate CareAgent clinical mode (create agent, bind Telegram, register)',
    handler: async () => {
      await runActivateCommand(workspacePath, audit, profile);
    },
  });

  adapter.registerCliCommand({
    name: 'careagent deactivate',
    description: 'Deactivate CareAgent clinical mode (unbind Telegram, return to personal agent)',
    handler: async () => {
      await runDeactivateCommand(audit);
    },
  });

  adapter.registerCliCommand({
    name: 'careagent uninstall',
    description: 'Remove CareAgent agent and restore default bindings',
    handler: async () => {
      await runUninstallCommand(audit);
    },
  });
}
