import * as core from '@actions/core';
import { run, getInputs, isSpriteKitSprite, isSpriteOlderThan } from './index';
import { SpritesClient } from '../common/client';
import { Sprite } from '../common/types';

// Mock @actions/core
jest.mock('@actions/core', () => ({
  getInput: jest.fn(),
  setOutput: jest.fn(),
  setFailed: jest.fn(),
  info: jest.fn(),
  warning: jest.fn(),
  debug: jest.fn(),
  setSecret: jest.fn(),
}));

describe('Cleanup Action', () => {
  let mockClient: jest.Mocked<SpritesClient>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup default input mocks
    (core.getInput as jest.Mock).mockReturnValue('');

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
      deleteSprite: jest.fn(),
      listSprites: jest.fn(),
    } as unknown as jest.Mocked<SpritesClient>;
  });

  describe('getInputs', () => {
    it('should read sprite-id from input', () => {
      (core.getInput as jest.Mock).mockImplementation((name: string) => {
        if (name === 'sprite-id') return 'sprite-123';
        return '';
      });

      const inputs = getInputs();
      expect(inputs.spriteName).toBe('sprite-123');
    });

    it('should parse max-age-days as number with default', () => {
      (core.getInput as jest.Mock).mockImplementation((name: string) => {
        if (name === 'max-age-days') return '7';
        return '';
      });

      const inputs = getInputs();
      expect(inputs.maxAgeDays).toBe(7);
    });

    it('should default max-age-days to 3', () => {
      (core.getInput as jest.Mock).mockReturnValue('');

      const inputs = getInputs();
      expect(inputs.maxAgeDays).toBe(3);
    });

    it('should parse dry-run boolean', () => {
      (core.getInput as jest.Mock).mockImplementation((name: string) => {
        if (name === 'dry-run') return 'true';
        return '';
      });

      const inputs = getInputs();
      expect(inputs.dryRun).toBe(true);
    });

    it('should default dry-run to false', () => {
      (core.getInput as jest.Mock).mockReturnValue('');

      const inputs = getInputs();
      expect(inputs.dryRun).toBe(false);
    });

    it('should read token from env var', () => {
      process.env.SPRITES_TOKEN = 'env-token';
      (core.getInput as jest.Mock).mockReturnValue('');

      const inputs = getInputs();
      expect(inputs.token).toBe('env-token');

      delete process.env.SPRITES_TOKEN;
    });
  });

  describe('isSpriteKitSprite', () => {
    it('should return true for sprites with gh- prefix', () => {
      const sprite: Sprite = {
        id: 'sprite-123',
        name: 'gh-owner-repo-workflow-123-job',
        organization: 'test-org',
        url: 'https://gh-owner-repo-workflow-123-job.sprites.app',
        url_settings: { auth: 'sprite' as const },
        status: 'running',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      expect(isSpriteKitSprite(sprite)).toBe(true);
    });

    it('should return false for sprites without gh- prefix', () => {
      const sprite: Sprite = {
        id: 'sprite-123',
        name: 'my-custom-sprite',
        organization: 'test-org',
        url: 'https://my-custom-sprite.sprites.app',
        url_settings: { auth: 'sprite' as const },
        status: 'running',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      expect(isSpriteKitSprite(sprite)).toBe(false);
    });

    it('should return false for sprites with gh in middle of name', () => {
      const sprite: Sprite = {
        id: 'sprite-123',
        name: 'some-gh-sprite',
        organization: 'test-org',
        url: 'https://some-gh-sprite.sprites.app',
        url_settings: { auth: 'sprite' as const },
        status: 'running',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      expect(isSpriteKitSprite(sprite)).toBe(false);
    });
  });

  describe('isSpriteOlderThan', () => {
    it('should return true for sprites older than specified days', () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 5);

      const sprite: Sprite = {
        id: 'sprite-123',
        name: 'gh-old-sprite',
        organization: 'test-org',
        url: 'https://gh-old-sprite.sprites.app',
        url_settings: { auth: 'sprite' as const },
        status: 'running',
        created_at: oldDate.toISOString(),
        updated_at: oldDate.toISOString(),
      };

      expect(isSpriteOlderThan(sprite, 3)).toBe(true);
    });

    it('should return false for sprites newer than specified days', () => {
      const newDate = new Date();
      newDate.setDate(newDate.getDate() - 1);

      const sprite: Sprite = {
        id: 'sprite-123',
        name: 'gh-new-sprite',
        organization: 'test-org',
        url: 'https://gh-new-sprite.sprites.app',
        url_settings: { auth: 'sprite' as const },
        status: 'running',
        created_at: newDate.toISOString(),
        updated_at: newDate.toISOString(),
      };

      expect(isSpriteOlderThan(sprite, 3)).toBe(false);
    });

    it('should return false for sprites created exactly at cutoff', () => {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 3);

      const sprite: Sprite = {
        id: 'sprite-123',
        name: 'gh-cutoff-sprite',
        organization: 'test-org',
        url: 'https://gh-cutoff-sprite.sprites.app',
        url_settings: { auth: 'sprite' as const },
        status: 'running',
        created_at: cutoffDate.toISOString(),
        updated_at: cutoffDate.toISOString(),
      };

      // Sprite at exactly cutoff should not be deleted (not strictly older)
      expect(isSpriteOlderThan(sprite, 3)).toBe(false);
    });
  });

  describe('run - specific sprite deletion', () => {
    it('should delete specific sprite by name', async () => {
      const sprite: Sprite = {
        id: 'sprite-123',
        name: 'gh-owner-repo-workflow-123-job',
        organization: 'test-org',
        url: 'https://gh-owner-repo-workflow-123-job.sprites.app',
        url_settings: { auth: 'sprite' as const },
        status: 'running',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      mockClient.getSprite.mockResolvedValue(sprite);
      mockClient.deleteSprite.mockResolvedValue();

      await run({
        token: 'test-token',
        maxAgeDays: 3,
        dryRun: false,
      }, () => mockClient);

      expect(mockClient.getSprite).toHaveBeenCalledWith('sprite-123');
      expect(mockClient.deleteSprite).toHaveBeenCalledWith('sprite-123');
      expect(core.setOutput).toHaveBeenCalledWith('deleted-count', '1');
      expect(core.setOutput).toHaveBeenCalledWith('deleted-sprites', '["sprite-123"]');
    });

    it('should skip deletion for non-sprite-kit sprites', async () => {
      const sprite: Sprite = {
        id: 'sprite-123',
        name: 'my-custom-sprite',
        organization: 'test-org',
        url: 'https://my-custom-sprite.sprites.app',
        url_settings: { auth: 'sprite' as const },
        status: 'running',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      mockClient.getSprite.mockResolvedValue(sprite);

      await run({
        token: 'test-token',
        maxAgeDays: 3,
        dryRun: false,
      }, () => mockClient);

      expect(mockClient.deleteSprite).not.toHaveBeenCalled();
      expect(core.warning).toHaveBeenCalledWith(
        expect.stringContaining('was not created by sprite-kit')
      );
      expect(core.setOutput).toHaveBeenCalledWith('deleted-count', '0');
    });

    it('should handle 404 when sprite not found', async () => {
      mockClient.getSprite.mockRejectedValue({ status: 404 });

      await run({
        token: 'test-token',
        maxAgeDays: 3,
        dryRun: false,
      }, () => mockClient);

      expect(core.info).toHaveBeenCalledWith(
        expect.stringContaining('not found')
      );
      expect(core.setOutput).toHaveBeenCalledWith('deleted-count', '0');
    });

    it('should respect dry-run for specific sprite', async () => {
      const sprite: Sprite = {
        id: 'sprite-123',
        name: 'gh-owner-repo-workflow-123-job',
        organization: 'test-org',
        url: 'https://gh-owner-repo-workflow-123-job.sprites.app',
        url_settings: { auth: 'sprite' as const },
        status: 'running',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      mockClient.getSprite.mockResolvedValue(sprite);

      await run({
        token: 'test-token',
        maxAgeDays: 3,
        dryRun: true,
      }, () => mockClient);

      expect(mockClient.deleteSprite).not.toHaveBeenCalled();
      expect(core.info).toHaveBeenCalledWith(
        expect.stringContaining('[DRY RUN]')
      );
      expect(core.setOutput).toHaveBeenCalledWith('deleted-count', '1');
    });
  });

  describe('run - batch cleanup', () => {
    it('should delete old sprites with gh- prefix', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 5);

      const sprites: Sprite[] = [
        {
          id: 'old-sprite-1',
          name: 'gh-owner-repo-workflow-1-job',
        organization: 'test-org',
        url: 'https://gh-owner-repo-workflow-1-job.sprites.app',
        url_settings: { auth: 'sprite' as const },
          status: 'running',
          created_at: oldDate.toISOString(),
          updated_at: oldDate.toISOString(),
        },
        {
          id: 'old-sprite-2',
          name: 'gh-owner-repo-workflow-2-job',
        organization: 'test-org',
        url: 'https://gh-owner-repo-workflow-2-job.sprites.app',
        url_settings: { auth: 'sprite' as const },
          status: 'running',
          created_at: oldDate.toISOString(),
          updated_at: oldDate.toISOString(),
        },
        {
          id: 'new-sprite',
          name: 'gh-owner-repo-workflow-3-job',
        organization: 'test-org',
        url: 'https://gh-owner-repo-workflow-3-job.sprites.app',
        url_settings: { auth: 'sprite' as const },
          status: 'running',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: 'non-gh-sprite',
          name: 'custom-sprite',
        organization: 'test-org',
        url: 'https://custom-sprite.sprites.app',
        url_settings: { auth: 'sprite' as const },
          status: 'running',
          created_at: oldDate.toISOString(),
          updated_at: oldDate.toISOString(),
        },
      ];

      mockClient.listSprites.mockResolvedValue({
        sprites: sprites.map(s => ({...s, org_slug: s.organization})),
        has_more: false,
      });
      mockClient.deleteSprite.mockResolvedValue();

      await run({
        token: 'test-token',
        maxAgeDays: 3,
        dryRun: false,
      }, () => mockClient);

      // Should only delete the 2 old gh- sprites
      expect(mockClient.deleteSprite).toHaveBeenCalledTimes(2);
      expect(mockClient.deleteSprite).toHaveBeenCalledWith('old-sprite-1');
      expect(mockClient.deleteSprite).toHaveBeenCalledWith('old-sprite-2');
      expect(core.setOutput).toHaveBeenCalledWith('deleted-count', '2');
    });

    it('should respect dry-run for batch cleanup', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 5);

      const sprites: Sprite[] = [
        {
          id: 'old-sprite',
          name: 'gh-owner-repo-workflow-1-job',
        organization: 'test-org',
        url: 'https://gh-owner-repo-workflow-1-job.sprites.app',
        url_settings: { auth: 'sprite' as const },
          status: 'running',
          created_at: oldDate.toISOString(),
          updated_at: oldDate.toISOString(),
        },
      ];

      mockClient.listSprites.mockResolvedValue({
        sprites: sprites.map(s => ({...s, org_slug: s.organization})),
        has_more: false,
      });

      await run({
        token: 'test-token',
        maxAgeDays: 3,
        dryRun: true,
      }, () => mockClient);

      expect(mockClient.deleteSprite).not.toHaveBeenCalled();
      expect(core.info).toHaveBeenCalledWith(
        expect.stringContaining('[DRY RUN]')
      );
    });

    it('should handle empty sprite list', async () => {
      mockClient.listSprites.mockResolvedValue({sprites: [], has_more: false});

      await run({
        token: 'test-token',
        maxAgeDays: 3,
        dryRun: false,
      }, () => mockClient);

      expect(mockClient.deleteSprite).not.toHaveBeenCalled();
      expect(core.setOutput).toHaveBeenCalledWith('deleted-count', '0');
    });

    it('should continue on individual delete failure', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 5);

      const sprites: Sprite[] = [
        {
          id: 'sprite-1',
          name: 'gh-owner-repo-workflow-1-job',
        organization: 'test-org',
        url: 'https://gh-owner-repo-workflow-1-job.sprites.app',
        url_settings: { auth: 'sprite' as const },
          status: 'running',
          created_at: oldDate.toISOString(),
          updated_at: oldDate.toISOString(),
        },
        {
          id: 'sprite-2',
          name: 'gh-owner-repo-workflow-2-job',
        organization: 'test-org',
        url: 'https://gh-owner-repo-workflow-2-job.sprites.app',
        url_settings: { auth: 'sprite' as const },
          status: 'running',
          created_at: oldDate.toISOString(),
          updated_at: oldDate.toISOString(),
        },
      ];

      mockClient.listSprites.mockResolvedValue({
        sprites: sprites.map(s => ({...s, org_slug: s.organization})),
        has_more: false,
      });
      mockClient.deleteSprite
        .mockRejectedValueOnce(new Error('Delete failed'))
        .mockResolvedValueOnce();

      await run({
        token: 'test-token',
        maxAgeDays: 3,
        dryRun: false,
      }, () => mockClient);

      expect(mockClient.deleteSprite).toHaveBeenCalledTimes(2);
      expect(core.warning).toHaveBeenCalledWith(
        expect.stringContaining('Failed to delete sprite')
      );
      // Should still report the successful deletion
      expect(core.setOutput).toHaveBeenCalledWith('deleted-count', '1');
    });
  });

  describe('run - error handling', () => {
    it('should fail if no token provided', async () => {
      process.env.SPRITES_TOKEN = '';

      await run({
        maxAgeDays: 3,
        dryRun: false,
      }, () => mockClient);

      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining('Sprites token is required')
      );
    });
  });
});

