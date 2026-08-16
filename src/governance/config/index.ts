import * as fs from 'fs';
import * as path from 'path';
import { GlobalConfig, GovernanceConfig } from '../../types';
import { createDefaultConfig, mergeCategoryConfig } from './defaults';

export class ConfigManager {
  private config: GlobalConfig;
  private governanceConfig: GovernanceConfig;

  constructor(governanceConfig: GovernanceConfig) {
    this.governanceConfig = governanceConfig;
    this.config = this.loadConfig();
  }

  private loadConfig(): GlobalConfig {
    const configPath = this.governanceConfig.configPath;
    
    if (fs.existsSync(configPath)) {
      const fileContent = fs.readFileSync(configPath, 'utf-8');
      const userConfig = JSON.parse(fileContent);
      return this.mergeWithDefaults(userConfig);
    }

    return createDefaultConfig('default-project');
  }

  private mergeWithDefaults(userConfig: Partial<GlobalConfig> & { projectName?: string }): GlobalConfig {
    const defaults = createDefaultConfig(userConfig.projectName || 'default-project');
    return this.deepMerge(defaults, userConfig);
  }

  private deepMerge(target: any, source: any): any {
    const result = { ...target };
    for (const key of Object.keys(source)) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(target[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    return result;
  }

  getConfig(): GlobalConfig {
    return this.config;
  }

  getConfigForCategory(category: string): GlobalConfig {
    return mergeCategoryConfig(this.config, category as any);
  }

  updateConfig(updates: Partial<GlobalConfig>): void {
    this.config = this.deepMerge(this.config, updates);
    this.persist();
  }

  persist(): void {
    const dir = path.dirname(this.governanceConfig.configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.governanceConfig.configPath, JSON.stringify(this.config, null, 2));
  }

  getGovernanceConfig(): GovernanceConfig {
    return this.governanceConfig;
  }
}

export function createGovernanceConfig(
  workspacePath: string,
  projectName: string = 'default-project'
): GovernanceConfig {
  const basePath = path.resolve(workspacePath, '.governance');
  return {
    ledgerPath: path.join(basePath, 'PROGRESS.json'),
    workspacePath: path.resolve(workspacePath),
    configPath: path.join(basePath, 'config.json'),
    logLevel: 'info',
    dryRun: false,
  };
}