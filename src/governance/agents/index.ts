import { AgentConfig, AgentCapability, ExecutionContext, ExecutionResult, TaskRecord } from '../../types';
import * as child_process from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export interface AgentAdapter {
  execute(context: ExecutionContext, task: TaskRecord): Promise<ExecutionResult>;
  validateCapabilities(capabilities: AgentCapability[]): boolean;
  getName(): string;
}

export abstract class BaseAgentAdapter implements AgentAdapter {
  protected config: AgentConfig;

  constructor(config: AgentConfig) {
    this.config = config;
  }

  abstract execute(context: ExecutionContext, task: TaskRecord): Promise<ExecutionResult>;

  validateCapabilities(capabilities: AgentCapability[]): boolean {
    return capabilities.every(cap => this.config.capabilities.includes(cap));
  }

  getName(): string {
    return this.config.type;
  }

  protected buildPrompt(task: TaskRecord, context: ExecutionContext): string {
    return `
Task: ${task.id}
Category: ${task.category}
Description: ${task.description}

Reference Code: ${task.referencePath}
Target Path: ${task.targetPath}

Acceptance Criteria:
${task.acceptanceCriteria.map(c => `- ${c}`).join('\n')}

Constraints:
- Write only to ${task.targetPath}
- Do not use TODO, FIXME, unimplemented!(), or placeholder code
- Code must pass all verification gates
- Follow existing code style and patterns in the codebase

Generate the complete implementation for ${task.targetPath}.
`.trim();
  }

  protected async execAgent(
    prompt: string, 
    workspacePath: string, 
    env: Record<string, string> = {}
  ): Promise<{ stdout: string; stderr: string; code: number }> {
    const args = [...this.config.args, prompt];
    const fullEnv = { ...process.env, ...this.config.env, ...env };
    
    return new Promise((resolve) => {
      const proc = child_process.spawn(this.config.command, args, {
        cwd: workspacePath,
        env: fullEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data) => { stdout += data.toString(); });
      proc.stderr?.on('data', (data) => { stderr += data.toString(); });

      const maxTime = parseInt(this.config.env['MAX_EXECUTION_TIME_MS'] || '300000', 10);
      const timeout = setTimeout(() => {
        proc.kill('SIGTERM');
        resolve({ stdout, stderr, code: -1 });
      }, maxTime);

      proc.on('close', (code) => {
        clearTimeout(timeout);
        resolve({ stdout, stderr, code: code || 0 });
      });

      proc.on('error', (error) => {
        clearTimeout(timeout);
        resolve({ stdout, stderr, code: -1 });
      });
    });
  }
}

export class ClaudeCodeAdapter extends BaseAgentAdapter {
  constructor(config: AgentConfig) {
    super({
      ...config,
      type: 'claude-code',
      command: config.command || 'claude',
      args: config.args || ['-p', '--bare', '--dangerously-skip-permissions'],
    });
  }

  async execute(context: ExecutionContext, task: TaskRecord): Promise<ExecutionResult> {
    const startTime = Date.now();
    const prompt = this.buildPrompt(task, context);
    
    const result = await this.execAgent(prompt, context.workspacePath, {
      GOVERNANCE_TASK_ID: task.id,
      GOVERNANCE_TARGET_PATH: task.targetPath,
    });

    return {
      taskId: task.id,
      success: result.code === 0,
      verificationResults: [],
      error: result.code !== 0 ? result.stderr : undefined,
      durationMs: Date.now() - startTime,
    };
  }
}

export class AiderAdapter extends BaseAgentAdapter {
  constructor(config: AgentConfig) {
    super({
      ...config,
      type: 'aider',
      command: config.command || 'aider',
      args: config.args || ['--no-git', '--yes', '--message'],
    });
  }

  async execute(context: ExecutionContext, task: TaskRecord): Promise<ExecutionResult> {
    const startTime = Date.now();
    const prompt = this.buildPrompt(task, context);
    const targetFile = path.join(context.workspacePath, task.targetPath);
    
    const args = [...this.config.args, prompt, targetFile];
    
    const result = await this.execAgentWithArgs(args, context.workspacePath);

    return {
      taskId: task.id,
      success: result.code === 0,
      verificationResults: [],
      error: result.code !== 0 ? result.stderr : undefined,
      durationMs: Date.now() - startTime,
    };
  }

  private async execAgentWithArgs(
    args: string[], 
    workspacePath: string
  ): Promise<{ stdout: string; stderr: string; code: number }> {
    return new Promise((resolve) => {
      const proc = child_process.spawn(this.config.command, args, {
        cwd: workspacePath,
        env: { ...process.env, ...this.config.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data) => { stdout += data.toString(); });
      proc.stderr?.on('data', (data) => { stderr += data.toString(); });

      const timeout = setTimeout(() => {
        proc.kill('SIGTERM');
        resolve({ stdout, stderr, code: -1 });
      }, 300000);

      proc.on('close', (code) => {
        clearTimeout(timeout);
        resolve({ stdout, stderr, code: code || 0 });
      });
    });
  }
}

export class OpenCodeAdapter extends BaseAgentAdapter {
  constructor(config: AgentConfig) {
    super({
      ...config,
      type: 'opencode',
      command: config.command || 'opencode',
      args: config.args || ['run', '--headless'],
    });
  }

  async execute(context: ExecutionContext, task: TaskRecord): Promise<ExecutionResult> {
    const startTime = Date.now();
    const prompt = this.buildPrompt(task, context);
    
    const result = await this.execAgent(prompt, context.workspacePath);

    return {
      taskId: task.id,
      success: result.code === 0,
      verificationResults: [],
      error: result.code !== 0 ? result.stderr : undefined,
      durationMs: Date.now() - startTime,
    };
  }
}

export class CustomAgentAdapter extends BaseAgentAdapter {
  private executor: (prompt: string, workspacePath: string) => Promise<{ stdout: string; stderr: string; code: number }>;

  constructor(config: AgentConfig, executor: CustomAgentAdapter['executor']) {
    super(config);
    this.executor = executor;
  }

  async execute(context: ExecutionContext, task: TaskRecord): Promise<ExecutionResult> {
    const startTime = Date.now();
    const prompt = this.buildPrompt(task, context);
    
    const result = await this.executor(prompt, context.workspacePath);

    return {
      taskId: task.id,
      success: result.code === 0,
      verificationResults: [],
      error: result.code !== 0 ? result.stderr : undefined,
      durationMs: Date.now() - startTime,
    };
  }
}

export function createAgentAdapter(config: AgentConfig): AgentAdapter {
  switch (config.type) {
    case 'claude-code':
      return new ClaudeCodeAdapter(config);
    case 'aider':
      return new AiderAdapter(config);
    case 'opencode':
      return new OpenCodeAdapter(config);
    case 'custom':
      throw new Error('Custom adapter requires executor function');
    default:
      throw new Error(`Unknown agent type: ${config.type}`);
  }
}