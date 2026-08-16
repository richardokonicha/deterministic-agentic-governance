import { SandboxEnforcer } from '@governance/sandbox';
import { SandboxPolicy } from '@/types';

describe('SandboxEnforcer', () => {
  const workspaceRoot = '/test/workspace';
  
  const policy: SandboxPolicy = {
    readOnlyPaths: ['src/**', 'package.json', '*.md'],
    writeOnlyPaths: ['src/**', 'tests/**', 'dist/**'],
    forbiddenPaths: ['.git/**', '.env*', '*.key', 'secrets/**'],
    allowedCommands: ['npm', 'pnpm', 'cargo', 'tsc', 'eslint', 'git', 'node'],
    forbiddenCommands: ['rm -rf', 'sudo', 'curl', 'wget'],
    networkAccess: false,
    maxExecutionTimeMs: 300000,
    maxMemoryMb: 1024,
  };

  let enforcer: SandboxEnforcer;

  beforeEach(() => {
    enforcer = new SandboxEnforcer(policy, workspaceRoot);
  });

  describe('validatePathAccess', () => {
    test('allows read access to permitted paths', () => {
      expect(enforcer.validatePathAccess('src/components/Button.tsx', 'read')).toBe(true);
      expect(enforcer.validatePathAccess('package.json', 'read')).toBe(true);
      expect(enforcer.validatePathAccess('README.md', 'read')).toBe(true);
    });

    test('denies read access to forbidden paths', () => {
      expect(enforcer.validatePathAccess('.git/config', 'read')).toBe(false);
      expect(enforcer.validatePathAccess('.env.local', 'read')).toBe(false);
      expect(enforcer.validatePathAccess('secrets/api.key', 'read')).toBe(false);
    });

    test('allows write access to permitted paths', () => {
      expect(enforcer.validatePathAccess('src/components/NewButton.tsx', 'write')).toBe(true);
      expect(enforcer.validatePathAccess('tests/Button.test.tsx', 'write')).toBe(true);
      expect(enforcer.validatePathAccess('dist/bundle.js', 'write')).toBe(true);
    });

    test('denies write access to forbidden paths', () => {
      expect(enforcer.validatePathAccess('.git/config', 'write')).toBe(false);
      expect(enforcer.validatePathAccess('.env', 'write')).toBe(false);
      expect(enforcer.validatePathAccess('secrets/key.pem', 'write')).toBe(false);
    });

    test('denies path traversal attempts', () => {
      expect(enforcer.validatePathAccess('../../etc/passwd', 'read')).toBe(false);
      expect(enforcer.validatePathAccess('/absolute/path', 'read')).toBe(false);
    });
  });

  describe('validateCommand', () => {
    test('allows permitted commands', () => {
      expect(enforcer.validateCommand('npm test')).toBe(true);
      expect(enforcer.validateCommand('cargo check')).toBe(true);
      expect(enforcer.validateCommand('tsc --noEmit')).toBe(true);
      expect(enforcer.validateCommand('eslint src')).toBe(true);
      expect(enforcer.validateCommand('git status')).toBe(true);
    });

    test('denies forbidden commands', () => {
      expect(enforcer.validateCommand('rm -rf /')).toBe(false);
      expect(enforcer.validateCommand('sudo apt-get install')).toBe(false);
      expect(enforcer.validateCommand('curl https://example.com')).toBe(false);
      expect(enforcer.validateCommand('wget http://malicious.com')).toBe(false);
    });

    test('denies empty commands', () => {
      expect(enforcer.validateCommand('')).toBe(false);
      expect(enforcer.validateCommand('   ')).toBe(false);
    });
  });

  describe('getResourceLimits', () => {
    test('returns configured limits', () => {
      const limits = enforcer.getResourceLimits();
      expect(limits.maxTimeMs).toBe(300000);
      expect(limits.maxMemoryMb).toBe(1024);
    });
  });

  describe('getNetworkAccess', () => {
    test('returns network access setting', () => {
      expect(enforcer.getNetworkAccess()).toBe(false);
    });
  });

  describe('createSandboxEnvironment', () => {
    test('returns environment variables', () => {
      const env = enforcer.createSandboxEnvironment();
      expect(env.GOVERNANCE_WORKSPACE).toBe(workspaceRoot);
      expect(env.GOVERNANCE_READ_PATHS).toContain('src/**');
      expect(env.GOVERNANCE_WRITE_PATHS).toContain('src/**');
      expect(env.GOVERNANCE_FORBIDDEN_PATHS).toContain('.git/**');
      expect(env.GOVERNANCE_ALLOWED_COMMANDS).toContain('npm');
      expect(env.GOVERNANCE_NETWORK_ACCESS).toBe('false');
      expect(env.GOVERNANCE_MAX_TIME_MS).toBe('300000');
      expect(env.GOVERNANCE_MAX_MEMORY_MB).toBe('1024');
    });
  });
});