import { GlobalConfig, SandboxPolicy, AgentConfig, GitConfig, TaskCategory } from '../../types';

export const DEFAULT_SANDBOX_POLICY: SandboxPolicy = {
  readOnlyPaths: [
    'src/**',
    'package.json',
    'tsconfig.json',
    'Cargo.toml',
    '*.md',
    '*.json',
  ],
  writeOnlyPaths: [
    'src/**',
    'tests/**',
    'dist/**',
    'build/**',
  ],
  forbiddenPaths: [
    '.git/**',
    'node_modules/**',
    '.env*',
    '*.key',
    '*.pem',
    'secrets/**',
  ],
  allowedCommands: [
    'npm',
    'pnpm',
    'yarn',
    'cargo',
    'tsc',
    'eslint',
    'prettier',
    'git',
    'node',
    'python3',
  ],
  forbiddenCommands: [
    'rm -rf',
    'sudo',
    'chmod 777',
    'curl',
    'wget',
    'ssh',
    'scp',
  ],
  networkAccess: false,
  maxExecutionTimeMs: 300000,
  maxMemoryMb: 1024,
};

export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  type: 'claude-code',
  command: 'claude',
  args: ['-p', '--bare', '--dangerously-skip-permissions'],
  env: {},
  headlessFlags: ['-p', '--bare', '--dangerously-skip-permissions'],
  capabilities: [
    'file_read',
    'file_write',
    'command_exec',
    'git_operations',
    'package_manager',
  ],
};

export const KILO_AGENT_CONFIG: AgentConfig = {
  type: 'kilo',
  command: 'kilo',
  args: ['run', '--headless'],
  env: {},
  headlessFlags: ['run', '--headless'],
  capabilities: [
    'file_read',
    'file_write',
    'command_exec',
    'git_operations',
    'package_manager',
  ],
};

export const DEFAULT_GIT_CONFIG: GitConfig = {
  autoCommit: true,
  commitMessageTemplate: 'feat(task-{taskId}): {description}\n\nTask: {taskId}\nCategory: {category}',
  branchPrefix: 'agent/',
  protectedBranches: ['main', 'master', 'production', 'release'],
  requireSignOff: false,
};

export const CATEGORY_CONFIGS: Record<TaskCategory, Partial<GlobalConfig>> = {
  LLM_INFERENCE: {
    verificationGates: ['TYPE_CHECK', 'SYNTAX_CHECK', 'AST_LINT', 'ANTI_STUB'],
    defaultMaxRetries: 3,
    defaultTimeoutMs: 300000,
  },
  DATA_STORAGE: {
    verificationGates: ['TYPE_CHECK', 'SYNTAX_CHECK', 'AST_LINT', 'ANTI_STUB', 'TEST_SUITE'],
    defaultMaxRetries: 3,
    defaultTimeoutMs: 300000,
  },
  UI_COMPONENT: {
    verificationGates: ['TYPE_CHECK', 'SYNTAX_CHECK', 'AST_LINT', 'ANTI_STUB'],
    defaultMaxRetries: 2,
    defaultTimeoutMs: 180000,
  },
  API_INTEGRATION: {
    verificationGates: ['TYPE_CHECK', 'SYNTAX_CHECK', 'AST_LINT', 'ANTI_STUB', 'TEST_SUITE'],
    defaultMaxRetries: 3,
    defaultTimeoutMs: 300000,
  },
  INFRASTRUCTURE: {
    verificationGates: ['TYPE_CHECK', 'SYNTAX_CHECK', 'AST_LINT', 'ANTI_STUB'],
    defaultMaxRetries: 2,
    defaultTimeoutMs: 600000,
  },
  TESTING: {
    verificationGates: ['TYPE_CHECK', 'SYNTAX_CHECK', 'AST_LINT', 'TEST_SUITE'],
    defaultMaxRetries: 2,
    defaultTimeoutMs: 300000,
  },
  DOCUMENTATION: {
    verificationGates: ['SYNTAX_CHECK'],
    defaultMaxRetries: 1,
    defaultTimeoutMs: 60000,
  },
  MIGRATION: {
    verificationGates: ['TYPE_CHECK', 'SYNTAX_CHECK', 'AST_LINT', 'ANTI_STUB', 'TEST_SUITE'],
    defaultMaxRetries: 5,
    defaultTimeoutMs: 600000,
  },
  REFACTORING: {
    verificationGates: ['TYPE_CHECK', 'SYNTAX_CHECK', 'AST_LINT', 'ANTI_STUB', 'TEST_SUITE'],
    defaultMaxRetries: 3,
    defaultTimeoutMs: 300000,
  },
  CUSTOM: {
    verificationGates: ['TYPE_CHECK', 'SYNTAX_CHECK', 'AST_LINT'],
    defaultMaxRetries: 3,
    defaultTimeoutMs: 300000,
  },
};

export function createDefaultConfig(projectName: string): GlobalConfig {
  return {
    projectName,
    maxConcurrentTasks: 1,
    defaultMaxRetries: 3,
    defaultTimeoutMs: 300000,
    verificationGates: ['TYPE_CHECK', 'SYNTAX_CHECK', 'AST_LINT', 'ANTI_STUB'],
    sandboxPolicy: DEFAULT_SANDBOX_POLICY,
    agentConfig: DEFAULT_AGENT_CONFIG,
    gitConfig: DEFAULT_GIT_CONFIG,
  };
}

export function mergeCategoryConfig(base: GlobalConfig, category: TaskCategory): GlobalConfig {
  const categoryConfig = CATEGORY_CONFIGS[category];
  return {
    ...base,
    ...categoryConfig,
    sandboxPolicy: { ...base.sandboxPolicy, ...categoryConfig.sandboxPolicy },
    agentConfig: { ...base.agentConfig, ...categoryConfig.agentConfig },
    gitConfig: { ...base.gitConfig, ...categoryConfig.gitConfig },
  };
}