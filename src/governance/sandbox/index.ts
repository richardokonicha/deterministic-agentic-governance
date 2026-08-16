import { SandboxPolicy, AgentCapability } from '../../types';
import * as path from 'path';

export class SandboxEnforcer {
  private policy: SandboxPolicy;
  private workspaceRoot: string;

  constructor(policy: SandboxPolicy, workspaceRoot: string) {
    this.policy = policy;
    this.workspaceRoot = path.resolve(workspaceRoot);
  }

  validatePathAccess(requestedPath: string, operation: 'read' | 'write'): boolean {
    const absolutePath = path.resolve(this.workspaceRoot, requestedPath);
    const relativePath = path.relative(this.workspaceRoot, absolutePath);

    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      return false;
    }

    if (operation === 'read') {
      return this.matchesPatterns(relativePath, this.policy.readOnlyPaths) &&
             !this.matchesPatterns(relativePath, this.policy.forbiddenPaths);
    } else {
      return this.matchesPatterns(relativePath, this.policy.writeOnlyPaths) &&
             !this.matchesPatterns(relativePath, this.policy.forbiddenPaths);
    }
  }

  validateCommand(command: string): boolean {
    const trimmed = command.trim();
    if (!trimmed) return false;
    const parts = trimmed.split(' ');
    const cmd = parts[0];
    if (!cmd) return false;
    
    if (this.policy.forbiddenCommands.some(fc => command.includes(fc))) {
      return false;
    }

    return this.policy.allowedCommands.some(ac => cmd === ac || cmd.endsWith(ac));
  }

  validateCapability(capability: AgentCapability): boolean {
    return true;
  }

  getResourceLimits(): { maxTimeMs: number; maxMemoryMb: number } {
    return {
      maxTimeMs: this.policy.maxExecutionTimeMs,
      maxMemoryMb: this.policy.maxMemoryMb,
    };
  }

  getNetworkAccess(): boolean {
    return this.policy.networkAccess;
  }

  private matchesPatterns(filePath: string, patterns: string[]): boolean {
    return patterns.some(pattern => this.matchPattern(filePath, pattern));
  }

  private matchPattern(filePath: string, pattern: string): boolean {
    if (pattern === '**' || pattern === '*') return true;
    
    // Convert glob pattern to regex
    // First escape special regex chars except * and **
    // Then replace ** (must do before single *)
    // Then replace single *
    let regexPattern = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*/g, '___DOUBLE_STAR___')
      .replace(/\*/g, '[^/]*')
      .replace(/___DOUBLE_STAR___/g, '([^/]+/)*[^/]*');
    
    // Handle patterns that don't start with ** - they should match from the beginning
    if (!pattern.startsWith('**')) {
      regexPattern = '^' + regexPattern + '$';
    } else {
      regexPattern = regexPattern + '$';
    }
    
    return new RegExp(regexPattern).test(filePath);
  }

  createSandboxEnvironment(): Record<string, string> {
    return {
      GOVERNANCE_WORKSPACE: this.workspaceRoot,
      GOVERNANCE_READ_PATHS: this.policy.readOnlyPaths.join(':'),
      GOVERNANCE_WRITE_PATHS: this.policy.writeOnlyPaths.join(':'),
      GOVERNANCE_FORBIDDEN_PATHS: this.policy.forbiddenPaths.join(':'),
      GOVERNANCE_ALLOWED_COMMANDS: this.policy.allowedCommands.join(':'),
      GOVERNANCE_NETWORK_ACCESS: this.policy.networkAccess.toString(),
      GOVERNANCE_MAX_TIME_MS: this.policy.maxExecutionTimeMs.toString(),
      GOVERNANCE_MAX_MEMORY_MB: this.policy.maxMemoryMb.toString(),
    };
  }
}

export function createDefaultSandboxEnforcer(workspaceRoot: string): SandboxEnforcer {
  const { DEFAULT_SANDBOX_POLICY } = require('../config/defaults');
  return new SandboxEnforcer(DEFAULT_SANDBOX_POLICY, workspaceRoot);
}