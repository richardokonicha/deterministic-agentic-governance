import { VerificationOrchestrator, VerificationContext, VerificationGateBase } from '@governance/verification';
import { TaskRecord, TaskStatus, VerificationGate } from '@/types';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('VerificationOrchestrator', () => {
  let tempDir: string;
  let workspacePath: string;
  let context: VerificationContext;
  let orchestrator: VerificationOrchestrator;

  const createTaskRecord = (overrides: Partial<TaskRecord> = {}): TaskRecord => ({
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
    status: 'PENDING' as TaskStatus,
    retryCount: 0,
    verificationLogs: [],
    ...overrides,
  });

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verification-test-'));
    workspacePath = tempDir;
    
    context = {
      workspacePath,
      task: createTaskRecord(),
      config: { verificationTimeoutMs: 60000 },
    };
    
    orchestrator = new VerificationOrchestrator(context);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('SyntaxCheckGate', () => {
    test('passes when no config files exist', async () => {
      const results = await orchestrator.runGates(['SYNTAX_CHECK']);
      expect(results).toHaveLength(1);
      expect(results[0].gate).toBe('SYNTAX_CHECK');
      expect(results[0].passed).toBe(true);
    });
  });

  describe('AntiStubGate', () => {
    test('passes when target path does not exist', async () => {
      const results = await orchestrator.runGates(['ANTI_STUB']);
      expect(results).toHaveLength(1);
      expect(results[0].gate).toBe('ANTI_STUB');
      expect(results[0].passed).toBe(true);
    });

    test('detects TODO comments', async () => {
      const targetDir = path.join(workspacePath, 'src');
      fs.mkdirSync(targetDir, { recursive: true });
      fs.writeFileSync(path.join(targetDir, 'Component.tsx'), '// TODO: implement this\nconst x = 1;');
      
      context.task = createTaskRecord({ targetPath: 'src/Component.tsx' });
      orchestrator = new VerificationOrchestrator(context);
      
      const results = await orchestrator.runGates(['ANTI_STUB']);
      expect(results[0].passed).toBe(false);
      expect(results[0].errors.some(e => e.includes('TODO'))).toBe(true);
    });

    test('detects unimplemented!() macro', async () => {
      const targetDir = path.join(workspacePath, 'src');
      fs.mkdirSync(targetDir, { recursive: true });
      fs.writeFileSync(path.join(targetDir, 'lib.rs'), 'fn foo() { unimplemented!() }');
      
      context.task = createTaskRecord({ targetPath: 'src/lib.rs' });
      orchestrator = new VerificationOrchestrator(context);
      
      const results = await orchestrator.runGates(['ANTI_STUB']);
      expect(results[0].passed).toBe(false);
      expect(results[0].errors.some(e => e.includes('unimplemented'))).toBe(true);
    });

    test('detects empty block bodies', async () => {
      const targetDir = path.join(workspacePath, 'src');
      fs.mkdirSync(targetDir, { recursive: true });
      fs.writeFileSync(path.join(targetDir, 'Component.tsx'), 'function foo() {}');
      
      context.task = createTaskRecord({ targetPath: 'src/Component.tsx' });
      orchestrator = new VerificationOrchestrator(context);
      
      const results = await orchestrator.runGates(['ANTI_STUB']);
      expect(results[0].passed).toBe(false);
    });

    test('passes clean code', async () => {
      const targetDir = path.join(workspacePath, 'src');
      fs.mkdirSync(targetDir, { recursive: true });
      fs.writeFileSync(path.join(targetDir, 'Component.tsx'), 'export function Button() { return <button>Click</button>; }');
      
      context.task = createTaskRecord({ targetPath: 'src/Component.tsx' });
      orchestrator = new VerificationOrchestrator(context);
      
      const results = await orchestrator.runGates(['ANTI_STUB']);
      expect(results[0].passed).toBe(true);
    });
  });

  describe('runGates', () => {
    test('runs multiple gates in sequence', async () => {
      const results = await orchestrator.runGates(['SYNTAX_CHECK', 'ANTI_STUB']);
      expect(results).toHaveLength(2);
      expect(results[0].gate).toBe('SYNTAX_CHECK');
      expect(results[1].gate).toBe('ANTI_STUB');
    });

    test('stops on first failure', async () => {
      const targetDir = path.join(workspacePath, 'src');
      fs.mkdirSync(targetDir, { recursive: true });
      fs.writeFileSync(path.join(targetDir, 'Component.tsx'), '// TODO: fix this');
      
      context.task = createTaskRecord({ targetPath: 'src/Component.tsx' });
      orchestrator = new VerificationOrchestrator(context);
      
      const results = await orchestrator.runGates(['ANTI_STUB', 'SYNTAX_CHECK']);
      expect(results).toHaveLength(1);
      expect(results[0].gate).toBe('ANTI_STUB');
      expect(results[0].passed).toBe(false);
    });

    test('returns error for unknown gate', async () => {
      const results = await orchestrator.runGates(['UNKNOWN_GATE' as VerificationGate]);
      expect(results).toHaveLength(1);
      expect(results[0].passed).toBe(false);
      expect(results[0].errors[0]).toContain('Unknown verification gate');
    });
  });

  describe('registerGate', () => {
    test('allows custom gate registration', async () => {
      class CustomGate extends VerificationGateBase {
        protected override getGateType(): VerificationGate {
          return 'CUSTOM';
        }
        protected override async run() {
          return { passed: true, output: 'custom', errors: [] };
        }
      }
      
      orchestrator.registerGate('CUSTOM', new CustomGate(context));
      const results = await orchestrator.runGates(['CUSTOM']);
      expect(results[0].gate).toBe('CUSTOM');
      expect(results[0].passed).toBe(true);
    });
  });
});