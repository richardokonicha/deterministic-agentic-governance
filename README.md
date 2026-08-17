# Deterministic Agentic Governance Framework

[![npm version](https://img.shields.io/npm/v/deterministic-agentic-governance.svg)](https://www.npmjs.com/package/deterministic-agentic-governance)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Tests](https://img.shields.io/badge/tests-36%20passing-brightgreen.svg)](https://github.com/richardokonicha/deterministic-agentic-governance)

A production-grade framework for governing autonomous AI agents in software engineering, implementing the three pillars of deterministic governance:

1. **Persistent State Ledger** - External task state management (PROGRESS.json)
2. **Permission Sandboxing** - Declarative runtime boundary enforcement
3. **Compiler Verification Gates** - Objective binary verification via compilers, linters, and AST analysis

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     GOVERNANCE ORCHESTRATOR                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │   LEDGER    │  │  SANDBOX    │  │ VERIFICATION│              │
│  │  MANAGER    │  │  ENFORCER   │  │ ORCHESTRATOR│              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
│         │               │                │                       │
│         ▼               ▼                ▼                       │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    AGENT ADAPTERS                        │    │
│  │  ┌──────────┐ ┌────────┐ ┌──────────┐ ┌──────────────┐  │    │
│  │  │Claude Code│ │ Aider  │ │ OpenCode │ │   Custom     │  │    │
│  │  └──────────┘ └────────┘ └──────────┘ └──────────────┘  │    │
│  └─────────────────────────────────────────────────────────┘    │
│         │                                                       │
│         ▼                                                       │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                     GIT MANAGER                          │    │
│  │  Atomic commits • Auto-rollback • Branch management      │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

## Installation

```bash
npm install @deterministic-agentic/governance
# or build from source
git clone <repo>
cd deterministic-agentic-governance
npm install
npm run build
```

## Quick Start

### 1. Initialize in your workspace

```bash
npx govern init --workspace ./my-project --project my-migration
```

### 2. Define tasks in JSON

```json
[
  {
    "id": "TASK-001",
    "category": "UI_COMPONENT",
    "referencePath": "src/components/OldButton.tsx",
    "targetPath": "src/components/NewButton.tsx",
    "description": "Migrate button component to new design system",
    "acceptanceCriteria": [
      "TypeScript compiles",
      "No stub implementations",
      "Passes ESLint"
    ],
    "dependencies": [],
    "maxRetries": 3,
    "timeoutMs": 180000,
    "metadata": {}
  }
]
```

### 3. Add tasks and run

```bash
npx govern add --file tasks.json
npx govern run
```

### 4. Monitor progress

```bash
npx govern status
```

## Core Concepts

### Task Specification

Each task is a granular, isolated unit of work:

| Field | Description |
|-------|-------------|
| `id` | Unique deterministic identifier (e.g., `TASK-001`) |
| `category` | Subsystem classification (see categories below) |
| `referencePath` | Read-only path to reference implementation |
| `targetPath` | Isolated destination for new code |
| `description` | Natural language task description |
| `acceptanceCriteria` | Verifiable success conditions |
| `dependencies` | Task IDs that must complete first |
| `maxRetries` | Maximum verification retry attempts |
| `timeoutMs` | Execution time limit |
| `metadata` | Arbitrary key-value data |

### Task Categories

| Category | Verification Gates | Default Retries | Timeout |
|----------|-------------------|-----------------|---------|
| `LLM_INFERENCE` | TYPE_CHECK, SYNTAX_CHECK, AST_LINT, ANTI_STUB | 3 | 5min |
| `DATA_STORAGE` | TYPE_CHECK, SYNTAX_CHECK, AST_LINT, ANTI_STUB, TEST_SUITE | 3 | 5min |
| `UI_COMPONENT` | TYPE_CHECK, SYNTAX_CHECK, AST_LINT, ANTI_STUB | 2 | 3min |
| `API_INTEGRATION` | TYPE_CHECK, SYNTAX_CHECK, AST_LINT, ANTI_STUB, TEST_SUITE | 3 | 5min |
| `INFRASTRUCTURE` | TYPE_CHECK, SYNTAX_CHECK, AST_LINT, ANTI_STUB | 2 | 10min |
| `TESTING` | TYPE_CHECK, SYNTAX_CHECK, AST_LINT, TEST_SUITE | 2 | 5min |
| `DOCUMENTATION` | SYNTAX_CHECK | 1 | 1min |
| `MIGRATION` | TYPE_CHECK, SYNTAX_CHECK, AST_LINT, ANTI_STUB, TEST_SUITE | 5 | 10min |
| `REFACTORING` | TYPE_CHECK, SYNTAX_CHECK, AST_LINT, ANTI_STUB, TEST_SUITE | 3 | 5min |

### Verification Gates

| Gate | Purpose | Tools |
|------|---------|-------|
| `TYPE_CHECK` | Type safety & compilation | `tsc --noEmit`, `cargo check` |
| `SYNTAX_CHECK` | Code formatting & syntax | `prettier --check`, `cargo fmt --check` |
| `AST_LINT` | Static analysis & best practices | `eslint`, `cargo clippy` |
| `ANTI_STUB` | Detect placeholder code | Regex/AST patterns for TODO, unimplemented!, etc. |
| `TEST_SUITE` | Functional correctness | `npm test`, `cargo test` |

### Governance Loop

```
while (pendingTasks exist) {
  1. FETCH next PENDING task from PROGRESS.json
  2. CREATE clean LLM context with ONLY task spec + reference
  3. EXECUTE agent in sandboxed environment
  4. RUN all verification gates
  5. IF all pass:
       COMMIT to git with structured message
       MARK task COMPLETED
     ELSE:
       CAPTURE stderr diagnostics
       INCREMENT retryCount
       IF retryCount >= maxRetries:
         ROLLBACK to base commit
         MARK task FAILED/QUARANTINED
       ELSE:
         FEED diagnostics to fresh LLM context for retry
}
```

## Configuration

### Sandbox Policy

```json
{
  "readOnlyPaths": ["src/**", "package.json"],
  "writeOnlyPaths": ["src/**", "tests/**"],
  "forbiddenPaths": [".git/**", ".env*", "*.key"],
  "allowedCommands": ["npm", "cargo", "tsc", "git"],
  "forbiddenCommands": ["rm -rf", "sudo", "curl"],
  "networkAccess": false,
  "maxExecutionTimeMs": 300000,
  "maxMemoryMb": 1024
}
```

### Agent Configuration

Supports multiple agent backends:

- **Claude Code** (default): `claude -p --bare --dangerously-skip-permissions`
- **Aider**: `aider --no-git --yes --message`
- **OpenCode**: `opencode run --headless`
- **Custom**: Implement `AgentAdapter` interface

## Example: Electron to Tauri Migration

The framework includes a complete example for migrating a desktop app from Electron to Tauri 2.0:

```bash
cd examples/electron-to-tauri
npx govern init --workspace . --project electron-to-tauri
npx govern add --file tasks.json
npx govern run
```

This executes 10 coordinated tasks covering:
- Rust/Tauri core runtime setup
- IPC layer replacement
- Hybrid SQLite + Markdown storage
- Non-blocking token streaming (10Hz throttle)
- React virtualization (@tanstack/react-virtual)
- Integration & component testing
- Build configuration & documentation

## Use Cases

### ✅ Ideal For

| Domain | Example Scenarios |
|--------|-------------------|
| **Large-Scale Migrations** | Electron → Tauri, Webpack → Vite, REST → GraphQL, Monolith → Microservices |
| **Automated Refactoring** | Design system migrations, TypeScript strict mode enablement, legacy pattern removal, dead code elimination |
| **Cross-Platform Generation** | API clients from OpenAPI, DB schema → ORM models, Protobuf/gRPC stubs |
| **Compliance-Required Environments** | Fintech, healthcare, defense - full audit trails, human sign-off gates, ISO 42001/NIST AI RMF |
| **CI/CD Automation** | Dependency updates with verification, security patch backporting, release preparation |
| **AI-Assisted Feature Development** | Epic → tasks → governed execution, parallel execution with dependencies, self-healing retries |

### ❌ Not Ideal For

| Scenario | Better Alternative |
|----------|-------------------|
| Quick prototyping / exploration | Direct LLM chat (Cursor, Claude Code) |
| Single-file edits | IDE copilot |
| Creative/exploratory coding | Unconstrained agent |
| Learning/experimentation | Notebook/REPL |

### Key Differentiator

Unlike conversational agents, this framework provides **deterministic guarantees**: every task either passes all compiler/linter gates and commits atomically, or rolls back cleanly with full diagnostic capture. No context rot, no hallucinated verifications, no partial broken states.

## Enterprise Governance

### Three-Tier Authorization Matrix

| Tier | Actions | Approval |
|------|---------|----------|
| **Autonomous** | Read code, create branches, run type checks, format files | Pre-approved |
| **Semi-Autonomous** | Open PRs, modify schemas, update dependencies | Human sign-off |
| **Forbidden** | Commit to protected branches, export secrets, unsandboxed network | Hard-blocked |

### Compliance Alignment

- **ISO/IEC 42001** - AI management systems
- **NIST AI RMF** - Risk management framework
- **IEEE 7000** - Ethical system design
- **SFIA 9** - Competency framework for AI supervision

## API Usage

```typescript
import { createOrchestrator, TaskSpec } from '@deterministic-agentic/governance';

const orchestrator = await createOrchestrator('./workspace', 'my-project');

orchestrator.addTask({
  id: 'TASK-001',
  category: 'UI_COMPONENT',
  referencePath: 'src/OldComponent.tsx',
  targetPath: 'src/NewComponent.tsx',
  description: 'Migrate component',
  acceptanceCriteria: ['TypeScript compiles', 'No stubs'],
  dependencies: [],
  maxRetries: 3,
  timeoutMs: 180000,
  metadata: {}
});

const results = await orchestrator.run();
console.log(orchestrator.getProgress());
```

## Why Deterministic Governance?

### The Problem: Compositional Decay

Unconstrained agents fail exponentially on multi-step tasks:

```
P_success(n) = p^n

With p = 0.95 (95% per-step reliability):
- 5 steps:  77% success
- 10 steps: 60% success  
- 20 steps: 36% success
- 50 steps:  8% success
```

### The Solution: Externalized Governance

By decoupling state from the LLM context window and enforcing objective verification gates, the framework achieves:

- **Zero context rot** - Fresh context per task
- **Deterministic verification** - Compiler/linter gates, not LLM self-eval
- **Atomic commits** - One task, one commit, auto-rollback on failure
- **Full auditability** - PROGRESS.json + git history + verification logs
- **Enterprise compliance** - Policy-as-code sandboxing, tiered authorization

## License

MIT