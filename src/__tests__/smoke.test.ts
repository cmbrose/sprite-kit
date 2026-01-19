/**
 * Smoke tests for sprite-kit
 *
 * These tests simulate the workflow scenarios described in the README,
 * testing the full init -> run -> checkpoint flow.
 */

import nock from 'nock';
import * as core from '@actions/core';
import { run as initRun } from '../init/index';
import { run as runRun } from '../run/index';
import { SpritesClient } from '../common/client';
import { Sprite, Checkpoint } from '../common/types';

// Mock @actions/core
jest.mock('@actions/core', () => ({
  getInput: jest.fn(),
  getState: jest.fn(),
  setOutput: jest.fn(),
  saveState: jest.fn(),
  setFailed: jest.fn(),
  info: jest.fn(),
  warning: jest.fn(),
  debug: jest.fn(),
  setSecret: jest.fn(),
  startGroup: jest.fn(),
  endGroup: jest.fn(),
}));

const API_URL = 'https://api.sprites.dev/v1';

// Helper to create a mock sprite
function createMockSprite(id: string, name: string): Sprite {
  return {
    id,
    name,
    organization: 'test-org',
    url: `https://${name}.sprites.app`,
    url_settings: { auth: 'sprite' },
    status: 'running',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  };
}

// Helper to create a mock checkpoint
function createMockCheckpoint(id: string, comment: string, create_time: string): Checkpoint {
  return {
    id,
    comment,
    create_time,
  };
}

// Helper to create exec response with proper NDJSON format
function createExecResponse(exitCode: number, stdout = '', stderr = ''): string {
  const lines: string[] = [];
  if (stdout) lines.push(JSON.stringify({ type: 'stdout', data: stdout }));
  if (stderr) lines.push(JSON.stringify({ type: 'stderr', data: stderr }));
  lines.push(JSON.stringify({ type: 'exit', code: exitCode }));
  return lines.join('\n');
}

describe('Smoke Tests - README Examples', () => {
  // State storage to simulate GitHub Actions state between steps
  let savedState: Record<string, string> = {};
  let savedOutputs: Record<string, string> = {};

  beforeEach(() => {
    jest.clearAllMocks();
    nock.cleanAll();
    savedState = {};
    savedOutputs = {};

    // Setup state save/get mocks
    (core.saveState as jest.Mock).mockImplementation((key: string, value: string) => {
      savedState[key] = value;
    });
    (core.getState as jest.Mock).mockImplementation((key: string) => savedState[key] || '');
    (core.setOutput as jest.Mock).mockImplementation((key: string, value: string) => {
      savedOutputs[key] = value;
    });
  });

  afterAll(() => {
    nock.restore();
  });

  describe('Basic Usage (Quick Start example)', () => {
    it('should execute init -> install -> build -> test flow', async () => {
      const spriteName = 'sprite-basic-001';
      const spriteName = 'gh-test-owner-test-repo-ci-12345-build';

      // Setup API mocks for init
      nock(API_URL)
        .get(`/sprites?prefix=${encodeURIComponent(spriteName)}`)
        .reply(200, []);

      nock(API_URL)
        .post('/sprites')
        .reply(201, createMockSprite(spriteName, spriteName));

      nock(API_URL)
        .get(`/sprites/${spriteName}/checkpoints`)
        .reply(200, []);

      // Run init
      const mockGhContext = {
        repo: { owner: 'test-owner', repo: 'test-repo' },
        workflow: 'CI',
        runId: 12345,
        job: 'build',
      };

      process.env.SPRITES_TOKEN = 'test-token';
      (core.getInput as jest.Mock).mockReturnValue('');

      const clientFactory = (token: string) => new SpritesClient(token, API_URL);
      await initRun(clientFactory, mockGhContext as never);

      // Verify init outputs
      expect(savedState['sprite-id']).toBe(spriteName);
      expect(savedState['job-key']).toBe('build');
      expect(savedState['run-id']).toBe('12345');

      // Setup API mocks for install step
      nock(API_URL)
        .get(`/sprites/${spriteName}/checkpoints`)
        .reply(200, []);

      nock(API_URL)
        .post(`/sprites/${spriteName}/exec`)
        .reply(200, createExecResponse(0, 'Installing...\n'));

      nock(API_URL)
        .post(`/sprites/${spriteName}/checkpoints`)
        .reply(201, createMockCheckpoint('cp-install', spriteName, 'ghrun=12345;job=build;step=install', '2024-01-01T00:00:00Z'));

      // Run install step
      await runRun({
        stepKey: 'install',
        run: 'npm ci',
        token: 'test-token',
        spriteName,
        jobKey: 'build',
        runId: '12345',
      }, (token) => new SpritesClient(token, API_URL));

      expect(savedOutputs['skipped']).toBe('false');
      expect(savedOutputs['exit-code']).toBe('0');
      expect(savedOutputs['checkpoint-id']).toBe('cp-install');

      // Setup API mocks for build step
      nock(API_URL)
        .get(`/sprites/${spriteName}/checkpoints`)
        .reply(200, [
          createMockCheckpoint('cp-install', spriteName, 'ghrun=12345;job=build;step=install', '2024-01-01T00:00:00Z'),
        ]);

      nock(API_URL)
        .post(`/sprites/${spriteName}/exec`)
        .reply(200, createExecResponse(0, 'Building...\n'));

      nock(API_URL)
        .post(`/sprites/${spriteName}/checkpoints`)
        .reply(201, createMockCheckpoint('cp-build', spriteName, 'ghrun=12345;job=build;step=build', '2024-01-01T01:00:00Z'));

      // Run build step
      await runRun({
        stepKey: 'build',
        run: 'npm run build',
        token: 'test-token',
        spriteName,
        jobKey: 'build',
        runId: '12345',
      }, (token) => new SpritesClient(token, API_URL));

      expect(savedOutputs['skipped']).toBe('false');
      expect(savedOutputs['checkpoint-id']).toBe('cp-build');

      delete process.env.SPRITES_TOKEN;
    });
  });

  describe('Rerun Scenario - Step Skipping', () => {
    it('should skip steps that have existing checkpoints', async () => {
      const spriteName = 'sprite-rerun-001';

      // Setup checkpoints as if previous run completed install and build
      const existingCheckpoints = [
        createMockCheckpoint('cp-install', spriteName, 'ghrun=12345;job=build;step=install', '2024-01-01T00:00:00Z'),
        createMockCheckpoint('cp-build', spriteName, 'ghrun=12345;job=build;step=build', '2024-01-01T01:00:00Z'),
      ];

      // Mock listCheckpoints to return existing checkpoints
      nock(API_URL)
        .get(`/sprites/${spriteName}/checkpoints`)
        .reply(200, existingCheckpoints);

      // Run install step - should be skipped
      await runRun({
        stepKey: 'install',
        run: 'npm ci',
        token: 'test-token',
        spriteName,
        jobKey: 'build',
        runId: '12345',
      }, (token) => new SpritesClient(token, API_URL));

      expect(savedOutputs['skipped']).toBe('true');
      expect(savedOutputs['checkpoint-id']).toBe('cp-install');
      expect(core.info).toHaveBeenCalledWith('Step "install" already completed, skipping execution');

      // Mock for build step
      nock(API_URL)
        .get(`/sprites/${spriteName}/checkpoints`)
        .reply(200, existingCheckpoints);

      // Run build step - should also be skipped
      await runRun({
        stepKey: 'build',
        run: 'npm run build',
        token: 'test-token',
        spriteName,
        jobKey: 'build',
        runId: '12345',
      }, (token) => new SpritesClient(token, API_URL));

      expect(savedOutputs['skipped']).toBe('true');
      expect(savedOutputs['checkpoint-id']).toBe('cp-build');
    });
  });

  describe('Rerun Scenario - Restore and Continue', () => {
    it('should restore from last checkpoint and continue failed step', async () => {
      const spriteName = 'sprite-restore-001';

      // Previous run completed install, failed at build
      const existingCheckpoints = [
        createMockCheckpoint('cp-install', spriteName, 'ghrun=12345;job=build;step=install', '2024-01-01T00:00:00Z'),
      ];

      // Mock for test step (which wasn't completed before)
      nock(API_URL)
        .get(`/sprites/${spriteName}/checkpoints`)
        .reply(200, existingCheckpoints);

      // Mock get checkpoint for restore verification
      nock(API_URL)
        .get(`/sprites/${spriteName}/checkpoints/cp-install`)
        .reply(200, existingCheckpoints[0]);

      // Mock restore
      nock(API_URL)
        .post(`/sprites/${spriteName}/checkpoints/cp-install/restore`)
        .reply(200);

      // Mock exec
      nock(API_URL)
        .post(`/sprites/${spriteName}/exec`)
        .reply(200, createExecResponse(0, 'Running tests...\n'));

      // Mock create checkpoint
      nock(API_URL)
        .post(`/sprites/${spriteName}/checkpoints`)
        .reply(201, createMockCheckpoint('cp-test', spriteName, 'ghrun=12345;job=build;step=test', '2024-01-01T02:00:00Z'));

      // Run test step with lastCheckpointId (simulating rerun)
      await runRun({
        stepKey: 'test',
        run: 'npm test',
        token: 'test-token',
        spriteName,
        jobKey: 'build',
        runId: '12345',
        lastCheckpointId: 'cp-install',
      }, (token) => new SpritesClient(token, API_URL));

      expect(savedOutputs['skipped']).toBe('false');
      expect(savedOutputs['restored']).toBe('true');
      expect(savedOutputs['checkpoint-id']).toBe('cp-test');
      expect(core.info).toHaveBeenCalledWith('Restoring from checkpoint: cp-install');
    });
  });

  describe('Matrix Jobs', () => {
    it('should create unique sprites for different matrix values', async () => {
      nock(API_URL)
        .get(/\/sprites\?name=/)
        .reply(200, []);

      nock(API_URL)
        .post('/sprites')
        .reply(201, (uri, body) => {
          const parsed = body as { name: string };
          return createMockSprite('sprite-node18', parsed.name);
        });

      nock(API_URL)
        .get(/\/sprites\/sprite-node18\/checkpoints/)
        .reply(200, []);

      const mockGhContext18 = {
        repo: { owner: 'test-owner', repo: 'test-repo' },
        workflow: 'CI',
        runId: 12345,
        job: 'build',
      };

      process.env.SPRITES_TOKEN = 'test-token';
      (core.getInput as jest.Mock).mockImplementation((name: string) => {
        if (name === 'matrix') return '{"node": 18}';
        return '';
      });

      const clientFactory = (token: string) => new SpritesClient(token, API_URL);
      await initRun(clientFactory, mockGhContext18 as never);

      // Sprite name should contain a hash for the matrix
      expect(savedOutputs['sprite-name']).toMatch(/-[a-f0-9]{8}$/);

      delete process.env.SPRITES_TOKEN;
    });
  });

  describe('Multi-line Commands', () => {
    it('should execute multi-line commands', async () => {
      const spriteName = 'sprite-multiline-001';
      const multiLineCommand = `apt-get update
apt-get install -y build-essential
npm ci
npm run build`;

      nock(API_URL)
        .get(`/sprites/${spriteName}/checkpoints`)
        .reply(200, []);

      nock(API_URL)
        .post(`/sprites/${spriteName}/exec`)
        .reply(200, createExecResponse(0, 'Installing...\n'));

      nock(API_URL)
        .post(`/sprites/${spriteName}/checkpoints`)
        .reply(201, createMockCheckpoint('cp-setup', spriteName, 'ghrun=12345;job=build;step=setup', '2024-01-01T00:00:00Z'));

      await runRun({
        stepKey: 'setup',
        run: multiLineCommand,
        token: 'test-token',
        spriteName,
        jobKey: 'build',
        runId: '12345',
      }, (token) => new SpritesClient(token, API_URL));

      expect(savedOutputs['skipped']).toBe('false');
      expect(savedOutputs['exit-code']).toBe('0');
    });
  });

  describe('Custom Working Directory', () => {
    it('should pass workdir to exec', async () => {
      const spriteName = 'sprite-workdir-001';

      nock(API_URL)
        .get(`/sprites/${spriteName}/checkpoints`)
        .reply(200, []);

      nock(API_URL)
        .post(`/sprites/${spriteName}/exec`)
        .reply(200, createExecResponse(0));

      nock(API_URL)
        .post(`/sprites/${spriteName}/checkpoints`)
        .reply(201, createMockCheckpoint('cp-frontend', spriteName, 'ghrun=12345;job=build;step=build-frontend', '2024-01-01T00:00:00Z'));

      await runRun({
        stepKey: 'build-frontend',
        run: 'npm run build',
        token: 'test-token',
        spriteName,
        jobKey: 'build',
        runId: '12345',
        workdir: '/app/frontend',
      }, (token) => new SpritesClient(token, API_URL));

      expect(savedOutputs['exit-code']).toBe('0');
    });
  });

  describe('Command Failure Handling', () => {
    it('should fail and not create checkpoint on command failure', async () => {
      const spriteName = 'sprite-fail-001';

      nock(API_URL)
        .get(`/sprites/${spriteName}/checkpoints`)
        .reply(200, []);

      nock(API_URL)
        .post(`/sprites/${spriteName}/exec`)
        .reply(200, createExecResponse(1, '', 'Test failed!\n'));

      await runRun({
        stepKey: 'test',
        run: 'npm test',
        token: 'test-token',
        spriteName,
        jobKey: 'build',
        runId: '12345',
      }, (token) => new SpritesClient(token, API_URL));

      expect(savedOutputs['exit-code']).toBe('1');
      expect(core.setFailed).toHaveBeenCalledWith('Command exited with code 1');
      // Checkpoint should not be created on failure
      expect(savedOutputs['checkpoint-id']).toBe('');
    });
  });

  describe('API Error Handling', () => {
    it('should fail gracefully on API error during execution', async () => {
      const spriteName = 'sprite-error-001';

      // Mock 500 error with retries
      nock(API_URL)
        .get(`/sprites/${spriteName}/checkpoints`)
        .times(4) // Retry 3 times + initial
        .reply(500, { message: 'Internal Server Error' });

      await runRun({
        stepKey: 'install',
        run: 'npm ci',
        token: 'test-token',
        spriteName,
        jobKey: 'build',
        runId: '12345',
      }, (token) => new SpritesClient(token, API_URL));

      expect(core.setFailed).toHaveBeenCalled();
    }, 30000);
  });

  describe('Full Workflow with Multiple Steps', () => {
    it('should complete full build workflow', async () => {
      const spriteName = 'sprite-full-001';
      const spriteName = 'gh-my-org-my-repo-build-and-test-99999-build';

      // Init step
      nock(API_URL)
        .get(`/sprites?prefix=${encodeURIComponent(spriteName)}`)
        .reply(200, [createMockSprite(spriteName, spriteName)]);

      nock(API_URL)
        .get(`/sprites/${spriteName}/checkpoints`)
        .reply(200, []);

      const mockGhContext = {
        repo: { owner: 'my-org', repo: 'my-repo' },
        workflow: 'Build and Test',
        runId: 99999,
        job: 'build',
      };

      process.env.SPRITES_TOKEN = 'workflow-token';
      (core.getInput as jest.Mock).mockReturnValue('');

      await initRun((token) => new SpritesClient(token, API_URL), mockGhContext as never);

      expect(savedState['sprite-id']).toBe(spriteName);

      // Step 1: Install
      nock(API_URL)
        .get(`/sprites/${spriteName}/checkpoints`)
        .reply(200, []);

      nock(API_URL)
        .post(`/sprites/${spriteName}/exec`)
        .reply(200, createExecResponse(0));

      nock(API_URL)
        .post(`/sprites/${spriteName}/checkpoints`)
        .reply(201, createMockCheckpoint('cp-1', spriteName, 'ghrun=99999;job=build;step=install', '2024-01-01T00:00:00Z'));

      await runRun({
        stepKey: 'install',
        run: 'npm ci',
        token: 'workflow-token',
        spriteName,
        jobKey: 'build',
        runId: '99999',
      }, (token) => new SpritesClient(token, API_URL));

      expect(savedOutputs['checkpoint-id']).toBe('cp-1');

      // Step 2: Build
      nock(API_URL)
        .get(`/sprites/${spriteName}/checkpoints`)
        .reply(200, [
          createMockCheckpoint('cp-1', spriteName, 'ghrun=99999;job=build;step=install', '2024-01-01T00:00:00Z'),
        ]);

      nock(API_URL)
        .post(`/sprites/${spriteName}/exec`)
        .reply(200, createExecResponse(0));

      nock(API_URL)
        .post(`/sprites/${spriteName}/checkpoints`)
        .reply(201, createMockCheckpoint('cp-2', spriteName, 'ghrun=99999;job=build;step=build', '2024-01-01T01:00:00Z'));

      await runRun({
        stepKey: 'build',
        run: 'npm run build',
        token: 'workflow-token',
        spriteName,
        jobKey: 'build',
        runId: '99999',
      }, (token) => new SpritesClient(token, API_URL));

      expect(savedOutputs['checkpoint-id']).toBe('cp-2');

      // Step 3: Test
      nock(API_URL)
        .get(`/sprites/${spriteName}/checkpoints`)
        .reply(200, [
          createMockCheckpoint('cp-1', spriteName, 'ghrun=99999;job=build;step=install', '2024-01-01T00:00:00Z'),
          createMockCheckpoint('cp-2', spriteName, 'ghrun=99999;job=build;step=build', '2024-01-01T01:00:00Z'),
        ]);

      nock(API_URL)
        .post(`/sprites/${spriteName}/exec`)
        .reply(200, createExecResponse(0));

      nock(API_URL)
        .post(`/sprites/${spriteName}/checkpoints`)
        .reply(201, createMockCheckpoint('cp-3', spriteName, 'ghrun=99999;job=build;step=test', '2024-01-01T02:00:00Z'));

      await runRun({
        stepKey: 'test',
        run: 'npm test',
        token: 'workflow-token',
        spriteName,
        jobKey: 'build',
        runId: '99999',
      }, (token) => new SpritesClient(token, API_URL));

      expect(savedOutputs['checkpoint-id']).toBe('cp-3');

      delete process.env.SPRITES_TOKEN;
    });
  });
});
