export type TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'QUARANTINED';

export type TaskCategory = 
  | 'LLM_INFERENCE' 
  | 'DATA_STORAGE' 
  | 'UI_COMPONENT' 
  | 'API_INTEGRATION' 
  | 'INFRASTRUCTURE' 
  | 'TESTING' 
  | 'DOCUMENTATION'
  | 'MIGRATION'
  | 'REFACTORING'
  | 'CUSTOM';

export interface TaskSpec {
  id: string;
  category: TaskCategory;
  referencePath: string;
  targetPath: string;
  description: string;
  acceptanceCriteria: string[];
  dependencies: string[];
  maxRetries: number;
  timeoutMs: number;
  metadata: Record<string, unknown>;
}

export interface TaskRecord extends TaskSpec {
  status: TaskStatus;
  retryCount: number;
  verificationLogs: VerificationLog[];
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

export interface VerificationLog {
  timestamp: string;
  gate: VerificationGate;
  passed: boolean;
  output: string;
  errors: string[];
  durationMs: number;
}

export type VerificationGate = 
  | 'TYPE_CHECK' 
  | 'SYNTAX_CHECK' 
  | 'AST_LINT' 
  | 'ANTI_STUB' 
  | 'TEST_SUITE' 
  | 'CUSTOM';

export interface LedgerData {
  version: string;
  projectName: string;
  createdAt: string;
  updatedAt: string;
  tasks: TaskRecord[];
  globalConfig: GlobalConfig;
}

export interface GlobalConfig {
  projectName: string;
  maxConcurrentTasks: number;
  defaultMaxRetries: number;
  defaultTimeoutMs: number;
  verificationGates: VerificationGate[];
  sandboxPolicy: SandboxPolicy;
  agentConfig: AgentConfig;
  gitConfig: GitConfig;
}

export interface SandboxPolicy {
  readOnlyPaths: string[];
  writeOnlyPaths: string[];
  forbiddenPaths: string[];
  allowedCommands: string[];
  forbiddenCommands: string[];
  networkAccess: boolean;
  maxExecutionTimeMs: number;
  maxMemoryMb: number;
}

export interface AgentConfig {
  type: 'claude-code' | 'aider' | 'opencode' | 'custom';
  command: string;
  args: string[];
  env: Record<string, string>;
  headlessFlags: string[];
  capabilities: AgentCapability[];
}

export type AgentCapability = 
  | 'file_read' 
  | 'file_write' 
  | 'file_delete' 
  | 'command_exec' 
  | 'git_operations' 
  | 'package_manager' 
  | 'network_request';

export interface GitConfig {
  autoCommit: boolean;
  commitMessageTemplate: string;
  branchPrefix: string;
  protectedBranches: string[];
  requireSignOff: boolean;
}

export interface ExecutionContext {
  task: TaskRecord;
  workspacePath: string;
  ledgerPath: string;
  config: GlobalConfig;
  git: GitState;
}

export interface GitState {
  repoPath: string;
  currentBranch: string;
  baseCommit: string;
  hasUncommittedChanges: boolean;
}

export interface VerificationResult {
  gate: VerificationGate;
  passed: boolean;
  output: string;
  errors: string[];
  durationMs: number;
  artifacts?: string[];
}

export interface ExecutionResult {
  taskId: string;
  success: boolean;
  verificationResults: VerificationResult[];
  gitCommitHash?: string;
  error?: string;
  durationMs: number;
}

export interface GovernanceConfig {
  ledgerPath: string;
  workspacePath: string;
  configPath: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  dryRun: boolean;
}