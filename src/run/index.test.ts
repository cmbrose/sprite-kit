import * as core from '@actions/core';
import { run, getInputs, validateInputs, shouldSkipStep, maybeRestore } from './index';
import { SpritesClient } from '../common/client';

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

describe('Run Action', () => {
  let mockClient: jest.Mocked<SpritesClient>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup default input mocks
    (core.getInput as jest.Mock).mockReturnValue('');
    (core.getState as jest.Mock).mockReturnValue('');

    // Create mock client
    mockClient = {
      createOrGetSprite: jest.fn(),
      listCheckpoints: jest.fn(),
      getSpriteByName: jest.fn(),
      getSprite: jest.fn(),
      getCheckpoint: jest.fn(),
      createCheckpoint: jest.fn(),
      restoreCheckpoint: jest.fn(),
      exec: jest.fn(),
    } as unknown as jest.Mocked<SpritesClient>;
  });

  describe('getInputs', () => {
    it('should read step-key from input', () => {
      (core.getInput as jest.Mock).mockImplementation((name: string) => {
        if (name === 'step-key') return 'install';
        if (name === 'run') return 'npm ci';
        return '';
      });

      const inputs = getInputs();
      expect(inputs.stepKey).toBe('install');
      expect(inputs.run).toBe('npm ci');
    });

    it('should fallback to state for sprite-id', () => {
      (core.getInput as jest.Mock).mockReturnValue('');
      (core.getState as jest.Mock).mockImplementation((name: string) => {
        if (name === 'sprite-id') return 'state-sprite-id';
        return '';
      });

      const inputs = getInputs();
      expect(inputs.spriteId).toBe('state-sprite-id');
    });

    it('should prefer input over state', () => {
      (core.getInput as jest.Mock).mockImplementation((name: string) => {
        if (name === 'sprite-id') return 'input-sprite-id';
        return '';
      });
      (core.getState as jest.Mock).mockImplementation((name: string) => {
        if (name === 'sprite-id') return 'state-sprite-id';
        return '';
      });

      const inputs = getInputs();
      expect(inputs.spriteId).toBe('input-sprite-id');
    });

    it('should read workdir', () => {
      (core.getInput as jest.Mock).mockImplementation((name: string) => {
        if (name === 'workdir') return '/app';
        return '';
      });

      const inputs = getInputs();
      expect(inputs.workdir).toBe('/app');
    });
  });

  describe('validateInputs', () => {
    const validInputs = {
      stepKey: 'install',
      run: 'npm ci',
      token: 'test-token',
      spriteId: 'sprite-123',
      jobKey: 'build',
      runId: '12345',
    };

    it('should pass with valid inputs', () => {
      expect(() => validateInputs(validInputs)).not.toThrow();
    });

    it('should throw if token is missing', () => {
      expect(() => validateInputs({ ...validInputs, token: undefined })).toThrow(
        'Sprites token is required'
      );
    });

    it('should throw if spriteId is missing', () => {
      expect(() => validateInputs({ ...validInputs, spriteId: '' })).toThrow(
        'Sprite ID is required'
      );
    });

    it('should throw if jobKey is missing', () => {
      expect(() => validateInputs({ ...validInputs, jobKey: '' })).toThrow(
        'Job key is required'
      );
    });

    it('should throw if runId is missing', () => {
      expect(() => validateInputs({ ...validInputs, runId: '' })).toThrow(
        'Run ID is required'
      );
    });
  });

  describe('shouldSkipStep', () => {
    it('should return skip=true when checkpoint exists', async () => {
      mockClient.listCheckpoints.mockResolvedValue([
        {
          id: 'cp-1',
          spriteId: 'sprite-123',
          comment: 'ghrun=12345;job=build;step=install',
          created_at: '2024-01-01T00:00:00Z',
        },
      ]);

      const result = await shouldSkipStep(mockClient, 'sprite-123', '12345', 'build', 'install');

      expect(result.skip).toBe(true);
      expect(result.existingCheckpointId).toBe('cp-1');
    });

    it('should return skip=false when no checkpoint exists', async () => {
      mockClient.listCheckpoints.mockResolvedValue([
        {
          id: 'cp-1',
          spriteId: 'sprite-123',
          comment: 'ghrun=12345;job=build;step=other',
          created_at: '2024-01-01T00:00:00Z',
        },
      ]);

      const result = await shouldSkipStep(mockClient, 'sprite-123', '12345', 'build', 'install');

      expect(result.skip).toBe(false);
      expect(result.existingCheckpointId).toBeNull();
    });

    it('should return skip=false for different run ID', async () => {
      mockClient.listCheckpoints.mockResolvedValue([
        {
          id: 'cp-1',
          spriteId: 'sprite-123',
          comment: 'ghrun=99999;job=build;step=install',
          created_at: '2024-01-01T00:00:00Z',
        },
      ]);

      const result = await shouldSkipStep(mockClient, 'sprite-123', '12345', 'build', 'install');

      expect(result.skip).toBe(false);
    });
  });

  describe('maybeRestore', () => {
    it('should return false when no lastCheckpointId', async () => {
      const result = await maybeRestore(mockClient, 'sprite-123', undefined, '12345', 'build');
      expect(result).toBe(false);
    });

    it('should restore and return true when checkpoint matches', async () => {
      mockClient.getCheckpoint.mockResolvedValue({
        id: 'cp-1',
        spriteId: 'sprite-123',
        comment: 'ghrun=12345;job=build;step=install',
        created_at: '2024-01-01T00:00:00Z',
      });
      mockClient.restoreCheckpoint.mockResolvedValue();

      const result = await maybeRestore(mockClient, 'sprite-123', 'cp-1', '12345', 'build');

      expect(result).toBe(true);
      expect(mockClient.restoreCheckpoint).toHaveBeenCalledWith('sprite-123', 'cp-1');
    });

    it('should skip restore and return false when checkpoint does not match', async () => {
      mockClient.getCheckpoint.mockResolvedValue({
        id: 'cp-1',
        spriteId: 'sprite-123',
        comment: 'ghrun=99999;job=other;step=install',
        created_at: '2024-01-01T00:00:00Z',
      });

      const result = await maybeRestore(mockClient, 'sprite-123', 'cp-1', '12345', 'build');

      expect(result).toBe(false);
      expect(core.warning).toHaveBeenCalledWith('Checkpoint does not match current run/job, skipping restore');
      expect(mockClient.restoreCheckpoint).not.toHaveBeenCalled();
    });

    it('should return false and warn on restore error', async () => {
      mockClient.getCheckpoint.mockRejectedValue(new Error('Not found'));

      const result = await maybeRestore(mockClient, 'sprite-123', 'cp-1', '12345', 'build');

      expect(result).toBe(false);
      expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('Failed to restore checkpoint'));
    });
  });

  describe('run', () => {
    const baseInputs = {
      stepKey: 'install',
      run: 'npm ci',
      token: 'test-token',
      spriteId: 'sprite-123',
      jobKey: 'build',
      runId: '12345',
    };

    it('should skip execution when checkpoint exists', async () => {
      mockClient.listCheckpoints.mockResolvedValue([
        {
          id: 'cp-1',
          spriteId: 'sprite-123',
          comment: 'ghrun=12345;job=build;step=install',
          created_at: '2024-01-01T00:00:00Z',
        },
      ]);

      await run(baseInputs, () => mockClient);

      expect(core.info).toHaveBeenCalledWith('Step "install" already completed, skipping execution');
      expect(core.setOutput).toHaveBeenCalledWith('skipped', 'true');
      expect(core.setOutput).toHaveBeenCalledWith('checkpoint-id', 'cp-1');
      expect(mockClient.exec).not.toHaveBeenCalled();
    });

    it('should execute command and create checkpoint on success', async () => {
      mockClient.listCheckpoints.mockResolvedValue([]);
      mockClient.exec.mockResolvedValue({ exitCode: 0, stdout: 'success', stderr: '' });
      mockClient.createCheckpoint.mockResolvedValue({
        id: 'cp-new',
        spriteId: 'sprite-123',
        comment: 'ghrun=12345;job=build;step=install',
        created_at: '2024-01-01T00:00:00Z',
      });

      await run(baseInputs, () => mockClient);

      expect(mockClient.exec).toHaveBeenCalledWith({
        spriteId: 'sprite-123',
        command: 'npm ci',
        workdir: undefined,
      });
      expect(mockClient.createCheckpoint).toHaveBeenCalledWith({
        spriteId: 'sprite-123',
        comment: 'ghrun=12345;job=build;step=install',
      });
      expect(core.setOutput).toHaveBeenCalledWith('skipped', 'false');
      expect(core.setOutput).toHaveBeenCalledWith('checkpoint-id', 'cp-new');
      expect(core.setOutput).toHaveBeenCalledWith('exit-code', '0');
    });

    it('should restore from checkpoint before execution', async () => {
      mockClient.listCheckpoints.mockResolvedValue([]);
      mockClient.getCheckpoint.mockResolvedValue({
        id: 'cp-previous',
        spriteId: 'sprite-123',
        comment: 'ghrun=12345;job=build;step=previous',
        created_at: '2024-01-01T00:00:00Z',
      });
      mockClient.restoreCheckpoint.mockResolvedValue();
      mockClient.exec.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
      mockClient.createCheckpoint.mockResolvedValue({
        id: 'cp-new',
        spriteId: 'sprite-123',
        created_at: '2024-01-01T00:00:00Z',
      });

      await run({ ...baseInputs, lastCheckpointId: 'cp-previous' }, () => mockClient);

      expect(mockClient.restoreCheckpoint).toHaveBeenCalledWith('sprite-123', 'cp-previous');
      expect(core.setOutput).toHaveBeenCalledWith('restored', 'true');
    });

    it('should fail when command exits with non-zero code', async () => {
      mockClient.listCheckpoints.mockResolvedValue([]);
      mockClient.exec.mockResolvedValue({ exitCode: 1, stdout: '', stderr: 'error' });

      await run(baseInputs, () => mockClient);

      expect(core.setFailed).toHaveBeenCalledWith('Command exited with code 1');
      expect(core.setOutput).toHaveBeenCalledWith('exit-code', '1');
      expect(mockClient.createCheckpoint).not.toHaveBeenCalled();
    });

    it('should pass workdir to exec', async () => {
      mockClient.listCheckpoints.mockResolvedValue([]);
      mockClient.exec.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
      mockClient.createCheckpoint.mockResolvedValue({
        id: 'cp-new',
        spriteId: 'sprite-123',
        created_at: '2024-01-01T00:00:00Z',
      });

      await run({ ...baseInputs, workdir: '/app/frontend' }, () => mockClient);

      expect(mockClient.exec).toHaveBeenCalledWith({
        spriteId: 'sprite-123',
        command: 'npm ci',
        workdir: '/app/frontend',
      });
    });

    it('should save checkpoint ID to state for subsequent steps', async () => {
      mockClient.listCheckpoints.mockResolvedValue([]);
      mockClient.exec.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
      mockClient.createCheckpoint.mockResolvedValue({
        id: 'cp-new',
        spriteId: 'sprite-123',
        created_at: '2024-01-01T00:00:00Z',
      });

      await run(baseInputs, () => mockClient);

      expect(core.saveState).toHaveBeenCalledWith('last-checkpoint-id', 'cp-new');
    });

    it('should set outputs even on failure', async () => {
      mockClient.listCheckpoints.mockRejectedValue(new Error('API Error'));

      await run(baseInputs, () => mockClient);

      expect(core.setOutput).toHaveBeenCalledWith('skipped', 'false');
      expect(core.setOutput).toHaveBeenCalledWith('checkpoint-id', '');
      expect(core.setOutput).toHaveBeenCalledWith('restored', 'false');
      expect(core.setOutput).toHaveBeenCalledWith('exit-code', '0');
      expect(core.setFailed).toHaveBeenCalledWith('API Error');
    });
  });
});
