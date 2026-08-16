import * as fs from 'fs';
import * as path from 'path';
import { 
  LedgerData, 
  TaskRecord, 
  TaskSpec, 
  TaskStatus, 
  VerificationLog,
  VerificationGate 
} from '../../types';
import { createDefaultConfig } from '../config/defaults';

export class LedgerManager {
  private ledgerPath: string;
  private ledger: LedgerData;
  private dirty: boolean = false;

  constructor(ledgerPath: string, projectName?: string) {
    this.ledgerPath = ledgerPath;
    this.ledger = this.loadOrCreate(projectName);
  }

  private loadOrCreate(projectName?: string): LedgerData {
    if (fs.existsSync(this.ledgerPath)) {
      const content = fs.readFileSync(this.ledgerPath, 'utf-8');
      return JSON.parse(content);
    }

    return this.createInitialLedger(projectName || 'default-project');
  }

  private createInitialLedger(projectName: string): LedgerData {
    const now = new Date().toISOString();
    return {
      version: '1.0.0',
      projectName,
      createdAt: now,
      updatedAt: now,
      tasks: [],
      globalConfig: createDefaultConfig(projectName),
    };
  }

  private markDirty(): void {
    this.dirty = true;
    this.ledger.updatedAt = new Date().toISOString();
  }

  persist(): void {
    if (!this.dirty) return;
    
    const dir = path.dirname(this.ledgerPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.ledgerPath, JSON.stringify(this.ledger, null, 2));
    this.dirty = false;
  }

  getLedger(): LedgerData {
    return this.ledger;
  }

  getAllTasks(): TaskRecord[] {
    return this.ledger.tasks;
  }

  getTask(id: string): TaskRecord | undefined {
    return this.ledger.tasks.find(t => t.id === id);
  }

  getTasksByStatus(status: TaskStatus): TaskRecord[] {
    return this.ledger.tasks.filter(t => t.status === status);
  }

  getNextPendingTask(): TaskRecord | undefined {
    return this.ledger.tasks
      .filter(t => t.status === 'PENDING')
      .sort((a, b) => a.id.localeCompare(b.id))[0];
  }

  addTask(spec: TaskSpec): TaskRecord {
    const task: TaskRecord = {
      ...spec,
      status: 'PENDING',
      retryCount: 0,
      verificationLogs: [],
      metadata: spec.metadata || {},
    };
    this.ledger.tasks.push(task);
    this.markDirty();
    return task;
  }

  addTasks(specs: TaskSpec[]): TaskRecord[] {
    return specs.map(spec => this.addTask(spec));
  }

  updateTaskStatus(id: string, status: TaskStatus): boolean {
    const task = this.getTask(id);
    if (!task) return false;

    task.status = status;
    if (status === 'IN_PROGRESS' && !task.startedAt) {
      task.startedAt = new Date().toISOString();
    }
    if (status === 'COMPLETED' || status === 'FAILED') {
      task.completedAt = new Date().toISOString();
    }
    this.markDirty();
    return true;
  }

  incrementRetryCount(id: string): number {
    const task = this.getTask(id);
    if (!task) return -1;
    task.retryCount++;
    this.markDirty();
    return task.retryCount;
  }

  addVerificationLog(id: string, log: VerificationLog): boolean {
    const task = this.getTask(id);
    if (!task) return false;
    task.verificationLogs.push(log);
    this.markDirty();
    return true;
  }

  setTaskError(id: string, error: string): boolean {
    const task = this.getTask(id);
    if (!task) return false;
    task.error = error;
    this.markDirty();
    return true;
  }

  getPendingCount(): number {
    return this.ledger.tasks.filter(t => t.status === 'PENDING').length;
  }

  getCompletedCount(): number {
    return this.ledger.tasks.filter(t => t.status === 'COMPLETED').length;
  }

  getFailedCount(): number {
    return this.ledger.tasks.filter(t => t.status === 'FAILED').length;
  }

  getProgressSummary(): { total: number; pending: number; inProgress: number; completed: number; failed: number } {
    const tasks = this.ledger.tasks;
    return {
      total: tasks.length,
      pending: tasks.filter(t => t.status === 'PENDING').length,
      inProgress: tasks.filter(t => t.status === 'IN_PROGRESS').length,
      completed: tasks.filter(t => t.status === 'COMPLETED').length,
      failed: tasks.filter(t => t.status === 'FAILED').length,
    };
  }

  reset(): void {
    this.ledger = this.createInitialLedger(this.ledger.projectName);
    this.dirty = true;
  }

  exportTasks(): TaskSpec[] {
    return this.ledger.tasks.map(({ status, retryCount, verificationLogs, startedAt, completedAt, error, ...spec }) => spec);
  }
}