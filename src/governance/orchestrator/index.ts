import { 
  GovernanceConfig, 
  GlobalConfig, 
  TaskRecord, 
  TaskSpec, 
  TaskStatus, 
  ExecutionContext, 
  ExecutionResult,
  VerificationResult,
  VerificationGate 
} from '../../types';
import { LedgerManager } from '../ledger';
import { ConfigManager, createGovernanceConfig } from '../config';
import { SandboxEnforcer } from '../sandbox';
import { VerificationOrchestrator, VerificationContext } from '../verification';
import { GitManager, createGitManager } from '../git';
import { createAgentAdapter, AgentAdapter } from '../agents';
import * as path from 'path';

export class GovernanceOrchestrator {
  private configManager: ConfigManager;
  private ledger: LedgerManager;
  private sandbox: SandboxEnforcer;
  private git: GitManager | null = null;
  private agent: AgentAdapter;
  private globalConfig: GlobalConfig;
  private running: boolean = false;
  private currentTask: TaskRecord | null = null;

  constructor(governanceConfig: GovernanceConfig) {
    this.configManager = new ConfigManager(governanceConfig);
    this.globalConfig = this.configManager.getConfig();
    this.ledger = new LedgerManager(governanceConfig.ledgerPath, this.globalConfig.projectName);
    this.sandbox = new SandboxEnforcer(this.globalConfig.sandboxPolicy, governanceConfig.workspacePath);
    this.agent = createAgentAdapter(this.globalConfig.agentConfig);
  }

  async initialize(): Promise<void> {
    this.git = await createGitManager(this.globalConfig.gitConfig, this.configManager.getGovernanceConfig().workspacePath);
    const gitState = await this.git.getState();
    
    if (gitState.hasUncommittedChanges) {
      throw new Error('Workspace has uncommitted changes. Please commit or stash before starting.');
    }
  }

  addTask(spec: TaskSpec): TaskRecord {
    return this.ledger.addTask(spec);
  }

  addTasks(specs: TaskSpec[]): TaskRecord[] {
    return this.ledger.addTasks(specs);
  }

  async run(): Promise<ExecutionResult[]> {
    this.running = true;
    const results: ExecutionResult[] = [];

    while (this.running) {
      const task = this.ledger.getNextPendingTask();
      if (!task) {
        break;
      }

      const result = await this.executeTask(task);
      results.push(result);

      if (!result.success && task.retryCount >= task.maxRetries) {
        this.ledger.updateTaskStatus(task.id, 'QUARANTINED');
      }
    }

    this.running = false;
    this.ledger.persist();
    return results;
  }

  async executeTask(task: TaskRecord): Promise<ExecutionResult> {
    this.currentTask = task;
    this.ledger.updateTaskStatus(task.id, 'IN_PROGRESS');
    this.ledger.persist();

    const gitState = await this.git!.getState();
    const baseCommit = gitState.baseCommit;

    const execContext: ExecutionContext = {
      task,
      workspacePath: this.configManager.getGovernanceConfig().workspacePath,
      ledgerPath: this.configManager.getGovernanceConfig().ledgerPath,
      config: this.globalConfig,
      git: gitState,
    };

    const taskConfig = this.configManager.getConfigForCategory(task.category);
    const verificationContext: VerificationContext = {
      workspacePath: execContext.workspacePath,
      task,
      config: { verificationTimeoutMs: task.timeoutMs },
    };

    const verificationOrchestrator = new VerificationOrchestrator(verificationContext);
    const verificationGates = taskConfig.verificationGates || this.globalConfig.verificationGates;

    let attempt = 0;
    const maxRetries = task.maxRetries || this.globalConfig.defaultMaxRetries;
    let lastResult: ExecutionResult | null = null;

    while (attempt <= maxRetries && this.running) {
      if (attempt > 0) {
        this.ledger.incrementRetryCount(task.id);
        await this.git!.rollbackToCommit(baseCommit);
      }

      const agentResult = await this.agent.execute(execContext, task);
      lastResult = agentResult;

      if (!agentResult.success) {
        attempt++;
        continue;
      }

      const verificationResults = await verificationOrchestrator.runGates(verificationGates);
      lastResult = {
        ...agentResult,
        verificationResults,
      };

      const allPassed = verificationResults.every(r => r.passed);

      if (allPassed) {
        if (this.globalConfig.gitConfig.autoCommit) {
          const commitHash = await this.git!.commitTask(task.id, task.description, task.category);
          lastResult.gitCommitHash = commitHash;
        }
        this.ledger.updateTaskStatus(task.id, 'COMPLETED');
        this.ledger.persist();
        return lastResult;
      }

      for (const vr of verificationResults) {
        this.ledger.addVerificationLog(task.id, {
          timestamp: new Date().toISOString(),
          gate: vr.gate,
          passed: vr.passed,
          output: vr.output,
          errors: vr.errors,
          durationMs: vr.durationMs,
        });
      }

      if (!allPassed) {
        const errorSummary = verificationResults
          .filter(r => !r.passed)
          .map(r => `${r.gate}: ${r.errors.join('; ')}`)
          .join('\n');
        this.ledger.setTaskError(task.id, errorSummary);
      }

      attempt++;
    }

    this.ledger.updateTaskStatus(task.id, 'FAILED');
    await this.git!.rollbackToCommit(baseCommit);
    this.ledger.persist();

    return lastResult || {
      taskId: task.id,
      success: false,
      verificationResults: [],
      error: 'Max retries exceeded',
      durationMs: 0,
    };
  }

  stop(): void {
    this.running = false;
  }

  getProgress() {
    return this.ledger.getProgressSummary();
  }

  getLedger() {
    return this.ledger.getLedger();
  }

  getCurrentTask(): TaskRecord | null {
    return this.currentTask;
  }

  updateGlobalConfig(updates: Partial<GlobalConfig>): void {
    this.configManager.updateConfig(updates);
    this.globalConfig = this.configManager.getConfig();
  }
}

export async function createOrchestrator(
  workspacePath: string,
  projectName: string = 'default-project'
): Promise<GovernanceOrchestrator> {
  const governanceConfig = createGovernanceConfig(workspacePath, projectName);
  const orchestrator = new GovernanceOrchestrator(governanceConfig);
  await orchestrator.initialize();
  return orchestrator;
}