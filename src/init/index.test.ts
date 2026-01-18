import * as core from '@actions/core';
import { run, getInputs, buildGitHubContext } from './index';
import { SpritesClient } from '../common/client';

// Mock @actions/core
jest.mock('@actions/core', () => ({
  getInput: jest.fn(),
  setOutput: jest.fn(),
  saveState: jest.fn(),
  setFailed: jest.fn(),
  info: jest.fn(),
  warning: jest.fn(),
  debug: jest.fn(),
  setSecret: jest.fn(),
}));

// Mock @actions/github
jest.mock('@actions/github', () => ({
  context: {
    repo: { owner: 'test-owner', repo: 'test-repo' },
    workflow: 'Test Workflow',
    runId: 12345,
    job: 'build',
  },
}));

describe('Init Action', () => {
  let mockClient: jest.Mocked<SpritesClient>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup default input mocks
    (core.getInput as jest.Mock).mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        token: '',
        'api-url': '',
        'job-key': '',
        matrix: '',
      };
      return inputs[name] || '';
    });

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
    it('should read token from input', () => {
      (core.getInput as jest.Mock).mockImplementation((name: string) => {
        if (name === 'token') return 'input-token';
        return '';
      });

      const inputs = getInputs();
      expect(inputs.token).toBe('input-token');
    });

    it('should fallback to SPRITES_TOKEN env var', () => {
      process.env.SPRITES_TOKEN = 'env-token';
      (core.getInput as jest.Mock).mockReturnValue('');

      const inputs = getInputs();
      expect(inputs.token).toBe('env-token');

      delete process.env.SPRITES_TOKEN;
    });

    it('should read matrix JSON', () => {
      (core.getInput as jest.Mock).mockImplementation((name: string) => {
        if (name === 'matrix') return '{"node": 18}';
        return '';
      });

      const inputs = getInputs();
      expect(inputs.matrixJson).toBe('{"node": 18}');
    });
  });

  describe('buildGitHubContext', () => {
    it('should build context from GitHub context', () => {
      const mockGhContext = {
        repo: { owner: 'my-org', repo: 'my-repo' },
        workflow: 'CI',
        runId: 99999,
        job: 'test',
      };

      const context = buildGitHubContext({}, mockGhContext as never);

      expect(context).toEqual({
        owner: 'my-org',
        repo: 'my-repo',
        workflow: 'CI',
        runId: '99999',
        job: 'test',
        matrix: undefined,
      });
    });

    it('should parse matrix from input', () => {
      const mockGhContext = {
        repo: { owner: 'my-org', repo: 'my-repo' },
        workflow: 'CI',
        runId: 99999,
        job: 'test',
      };

      const context = buildGitHubContext(
        { matrixJson: '{"os": "ubuntu", "node": 20}' },
        mockGhContext as never
      );

      expect(context.matrix).toEqual({ os: 'ubuntu', node: 20 });
    });

    it('should warn on invalid matrix JSON', () => {
      const mockGhContext = {
        repo: { owner: 'my-org', repo: 'my-repo' },
        workflow: 'CI',
        runId: 99999,
        job: 'test',
      };

      buildGitHubContext(
        { matrixJson: 'invalid-json' },
        mockGhContext as never
      );

      expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('Failed to parse matrix JSON'));
    });
  });

  describe('run', () => {
    const mockGhContext = {
      repo: { owner: 'test-owner', repo: 'test-repo' },
      workflow: 'CI',
      runId: 12345,
      job: 'build',
    };

    it('should fail if no token provided', async () => {
      process.env.SPRITES_TOKEN = '';
      (core.getInput as jest.Mock).mockReturnValue('');

      await run(() => mockClient, mockGhContext as never);

      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining('Sprites token is required')
      );
    });

    it('should create sprite and set outputs on success', async () => {
      process.env.SPRITES_TOKEN = 'test-token';
      (core.getInput as jest.Mock).mockReturnValue('');

      mockClient.createOrGetSprite.mockResolvedValue({
        id: 'sprite-123',
        name: 'gh-test-owner-test-repo-ci-12345-build',
        organization: 'test-org',
        url: 'https://gh-test-owner-test-repo-ci-12345-build.sprites.app',
        url_settings: { auth: 'sprite' as const },
        status: 'running',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      });
      mockClient.listCheckpoints.mockResolvedValue([]);

      await run(() => mockClient, mockGhContext as never);

      expect(mockClient.createOrGetSprite).toHaveBeenCalledWith({
        name: expect.stringContaining('gh-test-owner-test-repo'),
      });
      expect(core.setOutput).toHaveBeenCalledWith('sprite-id', 'sprite-123');
      expect(core.setOutput).toHaveBeenCalledWith('run-id', '12345');
      expect(core.setOutput).toHaveBeenCalledWith('needs-restore', 'false');
      expect(core.saveState).toHaveBeenCalledWith('sprite-id', 'sprite-123');

      delete process.env.SPRITES_TOKEN;
    });

    it('should find last checkpoint and set needs-restore', async () => {
      process.env.SPRITES_TOKEN = 'test-token';
      (core.getInput as jest.Mock).mockReturnValue('');

      mockClient.createOrGetSprite.mockResolvedValue({
        id: 'sprite-123',
        name: 'test-sprite',
        organization: 'test-org',
        url: 'https://test-sprite.sprites.app',
        url_settings: { auth: 'sprite' as const },
        status: 'running',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      });
      mockClient.listCheckpoints.mockResolvedValue([
        {
          id: 'cp-1',
          sprite_id: 'sprite-123',
          comment: 'ghrun=12345;job=build;step=install',
          created_at: '2024-01-01T00:00:00Z',
        },
        {
          id: 'cp-2',
          sprite_id: 'sprite-123',
          comment: 'ghrun=12345;job=build;step=build',
          created_at: '2024-01-01T01:00:00Z',
        },
      ]);

      await run(() => mockClient, mockGhContext as never);

      expect(core.setOutput).toHaveBeenCalledWith('last-checkpoint-id', 'cp-2');
      expect(core.setOutput).toHaveBeenCalledWith('needs-restore', 'true');
      expect(core.info).toHaveBeenCalledWith('Last successful checkpoint: cp-2');

      delete process.env.SPRITES_TOKEN;
    });

    it('should use custom job-key when provided', async () => {
      process.env.SPRITES_TOKEN = 'test-token';
      (core.getInput as jest.Mock).mockImplementation((name: string) => {
        if (name === 'job-key') return 'custom-job-key';
        return '';
      });

      mockClient.createOrGetSprite.mockResolvedValue({
        id: 'sprite-123',
        name: 'test-sprite',
        organization: 'test-org',
        url: 'https://test-sprite.sprites.app',
        url_settings: { auth: 'sprite' as const },
        status: 'running',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      });
      mockClient.listCheckpoints.mockResolvedValue([]);

      await run(() => mockClient, mockGhContext as never);

      expect(core.setOutput).toHaveBeenCalledWith('job-key', 'custom-job-key');

      delete process.env.SPRITES_TOKEN;
    });

    it('should handle API errors gracefully', async () => {
      process.env.SPRITES_TOKEN = 'test-token';
      (core.getInput as jest.Mock).mockReturnValue('');

      mockClient.createOrGetSprite.mockRejectedValue(new Error('API Error'));

      await run(() => mockClient, mockGhContext as never);

      expect(core.setFailed).toHaveBeenCalledWith('API Error');

      delete process.env.SPRITES_TOKEN;
    });
  });
});

