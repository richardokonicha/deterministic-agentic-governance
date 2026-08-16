export { GovernanceOrchestrator, createOrchestrator } from './governance/orchestrator';
export { LedgerManager } from './governance/ledger';
export { SandboxEnforcer, createDefaultSandboxEnforcer } from './governance/sandbox';
export { VerificationOrchestrator } from './governance/verification';
export type { VerificationContext } from './governance/verification';
export { GitManager, createGitManager } from './governance/git';
export { createAgentAdapter, BaseAgentAdapter, ClaudeCodeAdapter, AiderAdapter, OpenCodeAdapter, KiloCodeAdapter, CustomAgentAdapter } from './governance/agents';
export type { AgentAdapter } from './governance/agents';
export { ConfigManager, createGovernanceConfig, KILO_AGENT_CONFIG } from './governance/config';
export { CLI, runCLI } from './governance/cli';

export type * from './types';

import { runCLI } from './governance/cli';

async function main() {
  const args = process.argv.slice(2);
  await runCLI(args);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});