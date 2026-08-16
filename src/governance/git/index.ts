import { GitConfig, GitState, ExecutionResult } from '../../types';
import * as child_process from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export class GitManager {
  private config: GitConfig;
  private repoPath: string;

  constructor(config: GitConfig, repoPath: string) {
    this.config = config;
    this.repoPath = path.resolve(repoPath);
  }

  async getState(): Promise<GitState> {
    const [branch, baseCommit, status] = await Promise.all([
      this.getCurrentBranch(),
      this.getBaseCommit(),
      this.hasUncommittedChanges(),
    ]);

    return {
      repoPath: this.repoPath,
      currentBranch: branch,
      baseCommit,
      hasUncommittedChanges: status,
    };
  }

  private async getCurrentBranch(): Promise<string> {
    return this.execGit('rev-parse --abbrev-ref HEAD').then(r => r.stdout.trim());
  }

  private async getBaseCommit(): Promise<string> {
    return this.execGit('rev-parse HEAD').then(r => r.stdout.trim());
  }

  private async hasUncommittedChanges(): Promise<boolean> {
    const result = await this.execGit('status --porcelain');
    return result.stdout.trim().length > 0;
  }

  async createTaskBranch(taskId: string): Promise<string> {
    const branchName = `${this.config.branchPrefix}${taskId.toLowerCase()}`;
    await this.execGit(`checkout -b ${branchName}`);
    return branchName;
  }

  async commitTask(taskId: string, description: string, category: string): Promise<string> {
    const message = this.config.commitMessageTemplate
      .replace('{taskId}', taskId)
      .replace('{description}', description)
      .replace('{category}', category);

    await this.execGit('add -A');
    await this.execGit(`commit -m "${message}"`);
    
    return this.getBaseCommit();
  }

  async rollbackToBase(baseCommit: string): Promise<void> {
    await this.execGit(`reset --hard ${baseCommit}`);
    await this.execGit('clean -fd');
  }

  async rollbackToCommit(commitHash: string): Promise<void> {
    await this.execGit(`reset --hard ${commitHash}`);
    await this.execGit('clean -fd');
  }

  async deleteTaskBranch(taskId: string): Promise<void> {
    const branchName = `${this.config.branchPrefix}${taskId.toLowerCase()}`;
    try {
      await this.execGit(`branch -D ${branchName}`);
    } catch {
    }
  }

  async pushBranch(taskId: string): Promise<void> {
    const branchName = `${this.config.branchPrefix}${taskId.toLowerCase()}`;
    await this.execGit(`push origin ${branchName}`);
  }

  async createPullRequest(taskId: string, title: string, body: string): Promise<string> {
    const branchName = `${this.config.branchPrefix}${taskId.toLowerCase()}`;
    const result = await this.execCommand(`gh pr create --head ${branchName} --title "${title}" --body "${body}"`);
    return result.stdout.trim();
  }

  isProtectedBranch(branch: string): boolean {
    return this.config.protectedBranches.includes(branch);
  }

  private async execGit(args: string): Promise<{ stdout: string; stderr: string; code: number }> {
    return this.execCommand(`git ${args}`);
  }

  private async execCommand(command: string): Promise<{ stdout: string; stderr: string; code: number }> {
    return new Promise((resolve, reject) => {
      child_process.exec(command, { cwd: this.repoPath }, (error, stdout, stderr) => {
        if (error && error.code !== 1) {
          reject(error);
        } else {
          resolve({ stdout: stdout || '', stderr: stderr || '', code: error?.code || 0 });
        }
      });
    });
  }
}

export async function createGitManager(config: GitConfig, workspacePath: string): Promise<GitManager> {
  const gitDir = path.join(workspacePath, '.git');
  if (!fs.existsSync(gitDir)) {
    throw new Error('Not a git repository');
  }
  return new GitManager(config, workspacePath);
}