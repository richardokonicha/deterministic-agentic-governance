import { LedgerManager } from '@governance/ledger';
import { TaskSpec, TaskStatus } from '@/types';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('LedgerManager', () => {
  let tempDir: string;
  let ledgerPath: string;
  let ledger: LedgerManager;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'governance-test-'));
    ledgerPath = path.join(tempDir, 'PROGRESS.json');
    ledger = new LedgerManager(ledgerPath, 'test-project');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const createTaskSpec = (overrides: Partial<TaskSpec> = {}): TaskSpec => ({
    id: 'TASK-001',
    category: 'UI_COMPONENT',
    referencePath: 'src/Reference.tsx',
    targetPath: 'src/Target.tsx',
    description: 'Test task',
    acceptanceCriteria: ['Compiles', 'No stubs'],
    dependencies: [],
    maxRetries: 3,
    timeoutMs: 180000,
    metadata: {},
    ...overrides,
  });

  test('creates initial ledger with project name', () => {
    const data = ledger.getLedger();
    expect(data.projectName).toBe('test-project');
    expect(data.version).toBe('1.0.0');
    expect(data.tasks).toEqual([]);
  });

  test('adds task and persists', () => {
    const spec = createTaskSpec();
    const task = ledger.addTask(spec);
    
    expect(task.id).toBe('TASK-001');
    expect(task.status).toBe('PENDING');
    expect(task.retryCount).toBe(0);
    expect(task.verificationLogs).toEqual([]);
    
    const data = ledger.getLedger();
    expect(data.tasks).toHaveLength(1);
  });

  test('adds multiple tasks', () => {
    const specs = [
      createTaskSpec({ id: 'TASK-001' }),
      createTaskSpec({ id: 'TASK-002', category: 'DATA_STORAGE' }),
    ];
    const tasks = ledger.addTasks(specs);
    
    expect(tasks).toHaveLength(2);
    expect(ledger.getAllTasks()).toHaveLength(2);
  });

  test('gets task by id', () => {
    ledger.addTask(createTaskSpec({ id: 'TASK-001' }));
    const task = ledger.getTask('TASK-001');
    
    expect(task).toBeDefined();
    expect(task?.id).toBe('TASK-001');
  });

  test('returns undefined for non-existent task', () => {
    const task = ledger.getTask('NONEXISTENT');
    expect(task).toBeUndefined();
  });

  test('filters tasks by status', () => {
    ledger.addTask(createTaskSpec({ id: 'TASK-001' }));
    ledger.addTask(createTaskSpec({ id: 'TASK-002' }));
    
    ledger.updateTaskStatus('TASK-001', 'COMPLETED');
    ledger.updateTaskStatus('TASK-002', 'FAILED');
    
    expect(ledger.getTasksByStatus('PENDING')).toHaveLength(0);
    expect(ledger.getTasksByStatus('COMPLETED')).toHaveLength(1);
    expect(ledger.getTasksByStatus('FAILED')).toHaveLength(1);
  });

  test('gets next pending task in order', () => {
    ledger.addTask(createTaskSpec({ id: 'TASK-003' }));
    ledger.addTask(createTaskSpec({ id: 'TASK-001' }));
    ledger.addTask(createTaskSpec({ id: 'TASK-002' }));
    
    const next = ledger.getNextPendingTask();
    expect(next?.id).toBe('TASK-001');
  });

  test('updates task status', () => {
    ledger.addTask(createTaskSpec({ id: 'TASK-001' }));
    
    ledger.updateTaskStatus('TASK-001', 'IN_PROGRESS');
    let task = ledger.getTask('TASK-001');
    expect(task?.status).toBe('IN_PROGRESS');
    expect(task?.startedAt).toBeDefined();
    
    ledger.updateTaskStatus('TASK-001', 'COMPLETED');
    task = ledger.getTask('TASK-001');
    expect(task?.status).toBe('COMPLETED');
    expect(task?.completedAt).toBeDefined();
  });

  test('increments retry count', () => {
    ledger.addTask(createTaskSpec({ id: 'TASK-001' }));
    
    expect(ledger.incrementRetryCount('TASK-001')).toBe(1);
    expect(ledger.incrementRetryCount('TASK-001')).toBe(2);
    
    const task = ledger.getTask('TASK-001');
    expect(task?.retryCount).toBe(2);
  });

  test('adds verification logs', () => {
    ledger.addTask(createTaskSpec({ id: 'TASK-001' }));
    
    const log = {
      timestamp: new Date().toISOString(),
      gate: 'TYPE_CHECK' as const,
      passed: false,
      output: 'Error output',
      errors: ['Type error on line 10'],
      durationMs: 100,
    };
    
    ledger.addVerificationLog('TASK-001', log);
    
    const task = ledger.getTask('TASK-001');
    expect(task?.verificationLogs).toHaveLength(1);
    expect(task?.verificationLogs[0].gate).toBe('TYPE_CHECK');
  });

  test('sets task error', () => {
    ledger.addTask(createTaskSpec({ id: 'TASK-001' }));
    
    ledger.setTaskError('TASK-001', 'Compilation failed');
    
    const task = ledger.getTask('TASK-001');
    expect(task?.error).toBe('Compilation failed');
  });

  test('getProgressSummary returns correct counts', () => {
    ledger.addTask(createTaskSpec({ id: 'TASK-001' }));
    ledger.addTask(createTaskSpec({ id: 'TASK-002' }));
    ledger.addTask(createTaskSpec({ id: 'TASK-003' }));
    
    ledger.updateTaskStatus('TASK-001', 'COMPLETED');
    ledger.updateTaskStatus('TASK-002', 'FAILED');
    ledger.updateTaskStatus('TASK-003', 'IN_PROGRESS');
    
    const summary = ledger.getProgressSummary();
    expect(summary.total).toBe(3);
    expect(summary.pending).toBe(0);
    expect(summary.inProgress).toBe(1);
    expect(summary.completed).toBe(1);
    expect(summary.failed).toBe(1);
  });

  test('exportTasks returns clean specs without runtime fields', () => {
    ledger.addTask(createTaskSpec({ id: 'TASK-001' }));
    ledger.updateTaskStatus('TASK-001', 'COMPLETED');
    ledger.incrementRetryCount('TASK-001');
    ledger.addVerificationLog('TASK-001', {
      timestamp: new Date().toISOString(),
      gate: 'TYPE_CHECK',
      passed: true,
      output: '',
      errors: [],
      durationMs: 0,
    });
    
    const exported = ledger.exportTasks();
    expect(exported).toHaveLength(1);
    expect(exported[0]).toEqual(createTaskSpec({ id: 'TASK-001' }));
    expect(exported[0]).not.toHaveProperty('status');
    expect(exported[0]).not.toHaveProperty('retryCount');
    expect(exported[0]).not.toHaveProperty('verificationLogs');
  });

  test('reset clears all tasks', () => {
    ledger.addTask(createTaskSpec({ id: 'TASK-001' }));
    ledger.addTask(createTaskSpec({ id: 'TASK-002' }));
    ledger.reset();
    
    expect(ledger.getAllTasks()).toHaveLength(0);
    expect(ledger.getLedger().projectName).toBe('test-project');
  });

  test('loads existing ledger from disk', () => {
    ledger.addTask(createTaskSpec({ id: 'TASK-001' }));
    ledger.updateTaskStatus('TASK-001', 'COMPLETED');
    ledger.persist();
    
    const newLedger = new LedgerManager(ledgerPath, 'test-project');
    expect(newLedger.getAllTasks()).toHaveLength(1);
    expect(newLedger.getTask('TASK-001')?.status).toBe('COMPLETED');
  });
});