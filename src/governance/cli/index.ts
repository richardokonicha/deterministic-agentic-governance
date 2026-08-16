import { GovernanceOrchestrator, createOrchestrator } from '../orchestrator';
import { TaskSpec, TaskCategory, GovernanceConfig, TaskStatus } from '../../types';
import { LedgerManager } from '../ledger';
import { createGovernanceConfig } from '../config';
import * as fs from 'fs';
import * as path from 'path';

export interface CLIOptions {
  workspace: string;
  projectName?: string;
  config?: string;
  ledger?: string;
  dryRun?: boolean;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}

export class CLI {
  private orchestrator: GovernanceOrchestrator | null = null;
  private options: CLIOptions;

  constructor(options: CLIOptions) {
    this.options = options;
  }

  async init(): Promise<void> {
    const governanceConfig = createGovernanceConfig(this.options.workspace, this.options.projectName);
    this.orchestrator = new GovernanceOrchestrator(governanceConfig);
    await this.orchestrator.initialize();
    console.log('Governance framework initialized');
    console.log(`Workspace: ${this.options.workspace}`);
    console.log(`Ledger: ${governanceConfig.ledgerPath}`);
    console.log(`Config: ${governanceConfig.configPath}`);
  }

  async addTask(taskSpec: TaskSpec): Promise<void> {
    if (!this.orchestrator) await this.init();
    const task = this.orchestrator!.addTask(taskSpec);
    console.log(`Added task: ${task.id} (${task.category})`);
    this.orchestrator!.getLedger();
  }

  async addTasksFromFile(filePath: string): Promise<void> {
    if (!this.orchestrator) await this.init();
    const content = fs.readFileSync(filePath, 'utf-8');
    const specs: TaskSpec[] = JSON.parse(content);
    const tasks = this.orchestrator!.addTasks(specs);
    console.log(`Added ${tasks.length} tasks from ${filePath}`);
  }

  async run(): Promise<void> {
    if (!this.orchestrator) await this.init();
    console.log('Starting governance execution...');
    
    const results = await this.orchestrator!.run();
    
    const summary = this.orchestrator!.getProgress();
    console.log('\nExecution Complete');
    console.log(`Total: ${summary.total}`);
    console.log(`Completed: ${summary.completed}`);
    console.log(`Failed: ${summary.failed}`);
    console.log(`Pending: ${summary.pending}`);
    
    for (const result of results) {
      const status = result.success ? '✓' : '✗';
      console.log(`${status} ${result.taskId} (${result.durationMs}ms)`);
      if (!result.success && result.error) {
        console.log(`  Error: ${result.error}`);
      }
    }
  }

  async status(): Promise<void> {
    if (!this.orchestrator) await this.init();
    const summary = this.orchestrator!.getProgress();
    const ledger = this.orchestrator!.getLedger();
    
    console.log(`\nProject: ${ledger.projectName}`);
    console.log(`Total Tasks: ${summary.total}`);
    console.log(`  Pending: ${summary.pending}`);
    console.log(`  In Progress: ${summary.inProgress}`);
    console.log(`  Completed: ${summary.completed}`);
    console.log(`  Failed: ${summary.failed}`);
    
    const tasks = ledger.tasks;
    for (const task of tasks) {
      const statusIcon = this.getStatusIcon(task.status);
      console.log(`  ${statusIcon} ${task.id} [${task.category}] ${task.status}`);
      if (task.error) {
        console.log(`    Error: ${task.error}`);
      }
    }
  }

  async reset(): Promise<void> {
    if (!this.orchestrator) await this.init();
    this.orchestrator!.getLedger();
    const ledger = new LedgerManager(
      this.options.ledger || path.join(this.options.workspace, '.governance', 'PROGRESS.json'),
      this.options.projectName
    );
    ledger.reset();
    ledger.persist();
    console.log('Ledger reset');
  }

  async exportTasks(outputPath: string = 'tasks.json'): Promise<void> {
    if (!this.orchestrator) await this.init();
    const tasks = this.orchestrator!.getLedger().tasks.map(({ status, retryCount, verificationLogs, startedAt, completedAt, error, ...spec }) => spec);
    fs.writeFileSync(outputPath, JSON.stringify(tasks, null, 2));
    console.log(`Exported ${tasks.length} tasks to ${outputPath}`);
  }

  private getStatusIcon(status: TaskStatus): string {
    switch (status) {
      case 'PENDING': return '○';
      case 'IN_PROGRESS': return '◐';
      case 'COMPLETED': return '●';
      case 'FAILED': return '✗';
      case 'QUARANTINED': return '⚠';
      default: return '?';
    }
  }
}

export async function runCLI(args: string[]): Promise<void> {
  const options = parseArgs(args);
  const cli = new CLI(options);

  const command = args[0] || 'help';

  try {
    switch (command) {
      case 'init':
        await cli.init();
        break;
      case 'add':
        if (args[1] === '--file' && args[2]) {
          await cli.addTasksFromFile(args[2]);
        } else {
          console.error('Usage: govern add --file <tasks.json>');
        }
        break;
      case 'run':
        await cli.run();
        break;
      case 'status':
        await cli.status();
        break;
      case 'reset':
        await cli.reset();
        break;
      case 'export':
        await cli.exportTasks(args[1] || 'tasks.json');
        break;
      case 'help':
      default:
        printHelp();
        break;
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

function parseArgs(args: string[]): CLIOptions {
  const options: CLIOptions = {
    workspace: process.cwd(),
    projectName: 'default-project',
    dryRun: false,
    logLevel: 'info',
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--workspace':
      case '-w':
        options.workspace = args[++i] || options.workspace;
        break;
      case '--project':
      case '-p':
        options.projectName = args[++i] || options.projectName;
        break;
      case '--config':
      case '-c':
        options.config = args[++i];
        break;
      case '--ledger':
      case '-l':
        options.ledger = args[++i];
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--log-level':
        options.logLevel = args[++i] as any;
        break;
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`
Deterministic Agentic Governance Framework

Usage: govern <command> [options]

Commands:
  init                    Initialize governance framework in workspace
  add --file <file>       Add tasks from JSON file
  run                     Execute all pending tasks
  status                  Show task progress and status
  reset                   Reset ledger to empty state
  export [file]           Export task specifications to JSON
  help                    Show this help

Options:
  -w, --workspace <path>  Workspace directory (default: cwd)
  -p, --project <name>    Project name (default: default-project)
  -c, --config <path>     Config file path
  -l, --ledger <path>     Ledger file path
  --dry-run               Run without making changes
  --log-level <level>     Log level: debug|info|warn|error

Task JSON Format:
[
  {
    "id": "TASK-001",
    "category": "UI_COMPONENT",
    "referencePath": "src/components/ReferenceComponent.tsx",
    "targetPath": "src/components/NewComponent.tsx",
    "description": "Create new component based on reference",
    "acceptanceCriteria": ["TypeScript compiles", "No stubs", "Passes lint"],
    "dependencies": [],
    "maxRetries": 3,
    "timeoutMs": 180000,
    "metadata": {}
  }
]
`);
}