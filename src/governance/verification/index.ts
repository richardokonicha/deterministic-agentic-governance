import { VerificationGate, VerificationResult, TaskRecord } from '../../types';
import * as child_process from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export interface VerificationContext {
  workspacePath: string;
  task: TaskRecord;
  config: Record<string, any>;
}

export class VerificationGateBase {
  protected context: VerificationContext;

  constructor(context: VerificationContext) {
    this.context = context;
  }

  async execute(): Promise<VerificationResult> {
    const startTime = Date.now();
    try {
      const result = await this.run();
      return {
        gate: this.getGateType(),
        passed: result.passed,
        output: result.output,
        errors: result.errors,
        durationMs: Date.now() - startTime,
        artifacts: result.artifacts,
      };
    } catch (error) {
      return {
        gate: this.getGateType(),
        passed: false,
        output: '',
        errors: [error instanceof Error ? error.message : String(error)],
        durationMs: Date.now() - startTime,
      };
    }
  }

  protected async run(): Promise<{ passed: boolean; output: string; errors: string[]; artifacts?: string[] }> {
    throw new Error('Not implemented');
  }

  protected getGateType(): VerificationGate {
    throw new Error('Not implemented');
  }

  protected execCommand(command: string, options?: child_process.ExecOptions): Promise<{ stdout: string; stderr: string; code: number }> {
    return new Promise((resolve) => {
      child_process.exec(command, { 
        cwd: this.context.workspacePath,
        timeout: this.context.config['verificationTimeoutMs'] || 120000,
        ...options 
      }, (error, stdout, stderr) => {
        resolve({
          stdout: stdout?.toString() || '',
          stderr: stderr?.toString() || '',
          code: error?.code || 0,
        });
      });
    });
  }
}

export class TypeScriptVerificationGate extends VerificationGateBase {
  protected override getGateType(): VerificationGate {
    return 'TYPE_CHECK';
  }

  protected override async run() {
    const { workspacePath, task } = this.context;
    const tsconfigPath = path.join(workspacePath, 'tsconfig.json');
    
    if (!fs.existsSync(tsconfigPath)) {
      return { passed: true, output: 'No tsconfig.json found, skipping', errors: [] };
    }

    const result = await this.execCommand('npx tsc --noEmit');
    return {
      passed: result.code === 0,
      output: result.stdout,
      errors: result.stderr ? [result.stderr] : [],
    };
  }
}

export class RustVerificationGate extends VerificationGateBase {
  protected override getGateType(): VerificationGate {
    return 'TYPE_CHECK';
  }

  protected override async run() {
    const { workspacePath, task } = this.context;
    const cargoTomlPath = path.join(workspacePath, 'Cargo.toml');
    
    if (!fs.existsSync(cargoTomlPath)) {
      return { passed: true, output: 'No Cargo.toml found, skipping', errors: [] };
    }

    const result = await this.execCommand('cargo check');
    return {
      passed: result.code === 0,
      output: result.stdout,
      errors: result.stderr ? [result.stderr] : [],
    };
  }
}

export class SyntaxCheckGate extends VerificationGateBase {
  protected override getGateType(): VerificationGate {
    return 'SYNTAX_CHECK';
  }

  protected override async run() {
    const { workspacePath } = this.context;
    const results: { passed: boolean; output: string; errors: string[] }[] = [];

    if (fs.existsSync(path.join(workspacePath, 'package.json'))) {
      const result = await this.execCommand('npx prettier --check .');
      results.push({
        passed: result.code === 0,
        output: result.stdout,
        errors: result.stderr ? [result.stderr] : [],
      });
    }

    if (fs.existsSync(path.join(workspacePath, 'Cargo.toml'))) {
      const result = await this.execCommand('cargo fmt --check');
      results.push({
        passed: result.code === 0,
        output: result.stdout,
        errors: result.stderr ? [result.stderr] : [],
      });
    }

    const allPassed = results.every(r => r.passed);
    return {
      passed: allPassed,
      output: results.map(r => r.output).join('\n'),
      errors: results.flatMap(r => r.errors),
    };
  }
}

export class ASTLintGate extends VerificationGateBase {
  protected override getGateType(): VerificationGate {
    return 'AST_LINT';
  }

  protected override async run() {
    const { workspacePath } = this.context;
    const results: { passed: boolean; output: string; errors: string[] }[] = [];

    if (fs.existsSync(path.join(workspacePath, 'package.json'))) {
      const result = await this.execCommand('npx eslint . --ext .ts,.tsx,.js,.jsx');
      results.push({
        passed: result.code === 0,
        output: result.stdout,
        errors: result.stderr ? [result.stderr] : [],
      });
    }

    if (fs.existsSync(path.join(workspacePath, '.clippy.toml')) || fs.existsSync(path.join(workspacePath, 'Cargo.toml'))) {
      const result = await this.execCommand('cargo clippy -- -D warnings');
      results.push({
        passed: result.code === 0,
        output: result.stdout,
        errors: result.stderr ? [result.stderr] : [],
      });
    }

    const allPassed = results.every(r => r.passed);
    return {
      passed: allPassed,
      output: results.map(r => r.output).join('\n'),
      errors: results.flatMap(r => r.errors),
    };
  }
}

export class AntiStubGate extends VerificationGateBase {
  protected override getGateType(): VerificationGate {
    return 'ANTI_STUB';
  }

  protected override async run() {
    const { workspacePath, task } = this.context;
    const targetPath = path.join(workspacePath, task.targetPath);
    
    if (!fs.existsSync(targetPath)) {
      return { passed: true, output: 'Target path does not exist, skipping', errors: [] };
    }

    const stubPatterns = [
      /\/\/\s*TODO/gi,
      /\/\/\s*FIXME/gi,
      /\/\/\s*HACK/gi,
      /unimplemented!\(\)/g,
      /unreachable!\(\)/g,
      /panic!\(\)/g,
      /throw new Error\(['"]Not implemented['"]\)/g,
      /pass\s*$/gm,
      /\bfunction\s+\w+\s*\([^)]*\)\s*\{\s*\}/g,
      /\(\s*\)\s*=>\s*\{\s*\}/g,
      /\.\.\./g,
    ];

    const errors: string[] = [];
    const files = this.getAllFiles(targetPath);
    
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      const relativePath = path.relative(workspacePath, file);
      
      for (const pattern of stubPatterns) {
        const matches = content.match(pattern);
        if (matches) {
          errors.push(`${relativePath}: Found stub pattern "${matches[0]}" at ${matches.length} location(s)`);
        }
      }
    }

    return {
      passed: errors.length === 0,
      output: `Scanned ${files.length} files for stub patterns`,
      errors,
    };
  }

  private getAllFiles(dir: string): string[] {
    const files: string[] = [];
    
    if (!fs.existsSync(dir)) {
      return files;
    }
    
    const stat = fs.statSync(dir);
    if (stat.isFile()) {
      if (/\.(ts|tsx|js|jsx|rs|py|go|java)$/.test(dir)) {
        files.push(dir);
      }
      return files;
    }
    
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...this.getAllFiles(fullPath));
      } else if (/\.(ts|tsx|js|jsx|rs|py|go|java)$/.test(entry.name)) {
        files.push(fullPath);
      }
    }
    
    return files;
  }
}

export class TestSuiteGate extends VerificationGateBase {
  protected override getGateType(): VerificationGate {
    return 'TEST_SUITE';
  }

  protected override async run() {
    const { workspacePath } = this.context;
    const results: { passed: boolean; output: string; errors: string[] }[] = [];

    if (fs.existsSync(path.join(workspacePath, 'package.json'))) {
      const pkg = JSON.parse(fs.readFileSync(path.join(workspacePath, 'package.json'), 'utf-8'));
      if (pkg.scripts?.test) {
        const result = await this.execCommand('npm test');
        results.push({
          passed: result.code === 0,
          output: result.stdout,
          errors: result.stderr ? [result.stderr] : [],
        });
      }
    }

    if (fs.existsSync(path.join(workspacePath, 'Cargo.toml'))) {
      const result = await this.execCommand('cargo test');
      results.push({
        passed: result.code === 0,
        output: result.stdout,
        errors: result.stderr ? [result.stderr] : [],
      });
    }

    if (results.length === 0) {
      return { passed: true, output: 'No test suite configured', errors: [] };
    }

    const allPassed = results.every(r => r.passed);
    return {
      passed: allPassed,
      output: results.map(r => r.output).join('\n'),
      errors: results.flatMap(r => r.errors),
    };
  }
}

export class VerificationOrchestrator {
  private gates: Map<VerificationGate, VerificationGateBase> = new Map();

  constructor(private context: VerificationContext) {
    this.registerDefaultGates();
  }

  private registerDefaultGates(): void {
    this.gates.set('TYPE_CHECK', this.createTypeCheckGate());
    this.gates.set('SYNTAX_CHECK', new SyntaxCheckGate(this.context));
    this.gates.set('AST_LINT', new ASTLintGate(this.context));
    this.gates.set('ANTI_STUB', new AntiStubGate(this.context));
    this.gates.set('TEST_SUITE', new TestSuiteGate(this.context));
  }

  private createTypeCheckGate(): VerificationGateBase {
    const { workspacePath } = this.context;
    if (fs.existsSync(path.join(workspacePath, 'Cargo.toml'))) {
      return new RustVerificationGate(this.context);
    }
    return new TypeScriptVerificationGate(this.context);
  }

  registerGate(gate: VerificationGate, implementation: VerificationGateBase): void {
    this.gates.set(gate, implementation);
  }

  async runGates(gates: VerificationGate[]): Promise<VerificationResult[]> {
    const results: VerificationResult[] = [];
    
    for (const gate of gates) {
      const implementation = this.gates.get(gate);
      if (!implementation) {
        results.push({
          gate,
          passed: false,
          output: '',
          errors: [`Unknown verification gate: ${gate}`],
          durationMs: 0,
        });
        continue;
      }
      
      const result = await implementation.execute();
      results.push(result);
      
      if (!result.passed) {
        break;
      }
    }
    
    return results;
  }

  async runAll(): Promise<VerificationResult[]> {
    return this.runGates(Array.from(this.gates.keys()));
  }
}