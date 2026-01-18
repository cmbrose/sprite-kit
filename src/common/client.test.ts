import nock from 'nock';
import { SpritesClient } from './client';
import * as core from '@actions/core';

// Mock @actions/core
jest.mock('@actions/core', () => ({
  setSecret: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  warning: jest.fn(),
}));

describe('SpritesClient', () => {
  const API_URL = 'https://api.sprites.dev/v1';
  const TOKEN = 'test-token';

  beforeEach(() => {
    nock.cleanAll();
    jest.clearAllMocks();
  });

  afterAll(() => {
    nock.restore();
  });

  describe('constructor', () => {
    it('should mask token on initialization', () => {
      new SpritesClient(TOKEN);
      expect(core.setSecret).toHaveBeenCalledWith(TOKEN);
    });

    it('should use default API URL when not provided', () => {
      const client = new SpritesClient(TOKEN);
      expect(client['apiUrl']).toBe('https://api.sprites.dev/v1');
    });

    it('should use custom API URL when provided', () => {
      const customUrl = 'https://custom.api.dev';
      const client = new SpritesClient(TOKEN, customUrl);
      expect(client['apiUrl']).toBe(customUrl);
    });
  });

  describe('createOrGetSprite', () => {
    it('should return existing sprite if found by name', async () => {
      const existingSprite = {
        id: 'sprite-123',
        name: 'my-sprite',
        status: 'running',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      nock(API_URL)
        .get('/sprites?prefix=my-sprite')
        .reply(200, [existingSprite]);

      const client = new SpritesClient(TOKEN);
      const result = await client.createOrGetSprite({ name: 'my-sprite' });

      expect(result).toEqual(existingSprite);
      expect(core.info).toHaveBeenCalledWith('Found existing sprite: sprite-123');
    });

    it('should create new sprite if not found', async () => {
      const newSprite = {
        id: 'sprite-456',
        name: 'new-sprite',
        status: 'running',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      nock(API_URL)
        .get('/sprites?prefix=new-sprite')
        .reply(200, []);

      nock(API_URL)
        .post('/sprites', { name: 'new-sprite' })
        .reply(201, newSprite);

      const client = new SpritesClient(TOKEN);
      const result = await client.createOrGetSprite({ name: 'new-sprite' });

      expect(result).toEqual(newSprite);
      expect(core.info).toHaveBeenCalledWith('Created new sprite: sprite-456');
    });

    it('should create new sprite if search returns 404', async () => {
      const newSprite = {
        id: 'sprite-789',
        name: 'another-sprite',
        status: 'running',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      nock(API_URL)
        .get('/sprites?prefix=another-sprite')
        .reply(404, { message: 'Not found' });

      nock(API_URL)
        .post('/sprites', { name: 'another-sprite' })
        .reply(201, newSprite);

      const client = new SpritesClient(TOKEN);
      const result = await client.createOrGetSprite({ name: 'another-sprite' });

      expect(result).toEqual(newSprite);
    });
  });

  describe('getSpriteByName', () => {
    it('should return sprite when found', async () => {
      const sprite = {
        id: 'sprite-123',
        name: 'test-sprite',
        status: 'running',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      nock(API_URL)
        .get('/sprites?prefix=test-sprite')
        .reply(200, [sprite]);

      const client = new SpritesClient(TOKEN);
      const result = await client.getSpriteByName('test-sprite');

      expect(result).toEqual(sprite);
    });

    it('should return null when no sprites found', async () => {
      nock(API_URL)
        .get('/sprites?prefix=nonexistent')
        .reply(200, []);

      const client = new SpritesClient(TOKEN);
      const result = await client.getSpriteByName('nonexistent');

      expect(result).toBeNull();
    });

    it('should return null on 404', async () => {
      nock(API_URL)
        .get('/sprites?prefix=missing')
        .reply(404, { message: 'Not found' });

      const client = new SpritesClient(TOKEN);
      const result = await client.getSpriteByName('missing');

      expect(result).toBeNull();
    });
  });

  describe('getSprite', () => {
    it('should return sprite by ID', async () => {
      const sprite = {
        id: 'sprite-123',
        name: 'test-sprite',
        status: 'running',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      nock(API_URL)
        .get('/sprites/sprite-123')
        .reply(200, sprite);

      const client = new SpritesClient(TOKEN);
      const result = await client.getSprite('sprite-123');

      expect(result).toEqual(sprite);
    });

    it('should throw on 404', async () => {
      nock(API_URL)
        .get('/sprites/nonexistent')
        .reply(404, { message: 'Sprite not found' });

      const client = new SpritesClient(TOKEN);

      await expect(client.getSprite('nonexistent')).rejects.toMatchObject({
        status: 404,
      });
    });
  });

  describe('listCheckpoints', () => {
    it('should return list of checkpoints', async () => {
      const checkpoints = [
        { id: 'cp-1', spriteId: 'sprite-123', comment: 'ghrun=1;job=build;step=install', createdAt: '2024-01-01T00:00:00Z' },
        { id: 'cp-2', spriteId: 'sprite-123', comment: 'ghrun=1;job=build;step=build', createdAt: '2024-01-01T01:00:00Z' },
      ];

      nock(API_URL)
        .get('/sprites/sprite-123/checkpoints')
        .reply(200, checkpoints);

      const client = new SpritesClient(TOKEN);
      const result = await client.listCheckpoints('sprite-123');

      expect(result).toEqual(checkpoints);
    });

    it('should return empty array when no checkpoints', async () => {
      nock(API_URL)
        .get('/sprites/sprite-456/checkpoints')
        .reply(200, []);

      const client = new SpritesClient(TOKEN);
      const result = await client.listCheckpoints('sprite-456');

      expect(result).toEqual([]);
    });
  });

  describe('getCheckpoint', () => {
    it('should return checkpoint by ID', async () => {
      const checkpoint = {
        id: 'cp-123',
        spriteId: 'sprite-123',
        comment: 'ghrun=1;job=build;step=test',
        createdAt: '2024-01-01T00:00:00Z',
      };

      nock(API_URL)
        .get('/sprites/sprite-123/checkpoints/cp-123')
        .reply(200, checkpoint);

      const client = new SpritesClient(TOKEN);
      const result = await client.getCheckpoint('sprite-123', 'cp-123');

      expect(result).toEqual(checkpoint);
    });
  });

  describe('createCheckpoint', () => {
    it('should create checkpoint with comment', async () => {
      const checkpoint = {
        id: 'cp-new',
        spriteId: 'sprite-123',
        comment: 'ghrun=1;job=build;step=deploy',
        createdAt: '2024-01-01T00:00:00Z',
      };

      nock(API_URL)
        .post('/sprites/sprite-123/checkpoints', { comment: 'ghrun=1;job=build;step=deploy' })
        .reply(201, checkpoint);

      const client = new SpritesClient(TOKEN);
      const result = await client.createCheckpoint({
        spriteId: 'sprite-123',
        comment: 'ghrun=1;job=build;step=deploy',
      });

      expect(result).toEqual(checkpoint);
      expect(core.info).toHaveBeenCalledWith('Created checkpoint: cp-new');
    });
  });

  describe('restoreCheckpoint', () => {
    it('should restore from checkpoint', async () => {
      nock(API_URL)
        .post('/sprites/sprite-123/checkpoints/cp-123/restore')
        .reply(200);

      const client = new SpritesClient(TOKEN);
      await client.restoreCheckpoint('sprite-123', 'cp-123');

      expect(core.info).toHaveBeenCalledWith('Restored sprite sprite-123 from checkpoint cp-123');
    });
  });

  describe('retry logic', () => {
    it('should retry on 500 error', async () => {
      const sprite = {
        id: 'sprite-123',
        name: 'retry-sprite',
        status: 'running',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      nock(API_URL)
        .get('/sprites/sprite-123')
        .reply(500, { message: 'Internal Server Error' });

      nock(API_URL)
        .get('/sprites/sprite-123')
        .reply(200, sprite);

      const client = new SpritesClient(TOKEN);
      const result = await client.getSprite('sprite-123');

      expect(result).toEqual(sprite);
      expect(core.warning).toHaveBeenCalledWith(
        expect.stringContaining('Request failed')
      );
    }, 10000);

    it('should retry on 429 error', async () => {
      const checkpoints = [{ id: 'cp-1', spriteId: 'sprite-123', createdAt: '2024-01-01T00:00:00Z' }];

      nock(API_URL)
        .get('/sprites/sprite-123/checkpoints')
        .reply(429, { message: 'Too Many Requests' });

      nock(API_URL)
        .get('/sprites/sprite-123/checkpoints')
        .reply(200, checkpoints);

      const client = new SpritesClient(TOKEN);
      const result = await client.listCheckpoints('sprite-123');

      expect(result).toEqual(checkpoints);
    }, 10000);

    it('should fail after max retries', async () => {
      nock(API_URL)
        .get('/sprites/sprite-123')
        .times(4)
        .reply(500, { message: 'Internal Server Error' });

      const client = new SpritesClient(TOKEN);

      await expect(client.getSprite('sprite-123')).rejects.toMatchObject({
        status: 500,
      });
    }, 30000);

    it('should not retry on 400 error', async () => {
      nock(API_URL)
        .get('/sprites/bad-request')
        .reply(400, { message: 'Bad Request' });

      const client = new SpritesClient(TOKEN);

      await expect(client.getSprite('bad-request')).rejects.toMatchObject({
        status: 400,
      });

      // Should not have called warning (no retry)
      expect(core.warning).not.toHaveBeenCalled();
    });
  });

  describe('exec', () => {
    it('should execute command and stream output', async () => {
      const execResponse = [
        JSON.stringify({ type: 'stdout', data: 'Hello ' }),
        JSON.stringify({ type: 'stdout', data: 'World\n' }),
        JSON.stringify({ type: 'exit', code: 0 }),
      ].join('\n');

      nock(API_URL)
        .post('/sprites/sprite-123/exec', { command: 'echo "Hello World"' })
        .reply(200, execResponse);

      const client = new SpritesClient(TOKEN);
      const result = await client.exec({
        spriteId: 'sprite-123',
        command: 'echo "Hello World"',
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Hello');
      expect(result.stdout).toContain('World');
    });

    it('should handle stderr output', async () => {
      const execResponse = [
        JSON.stringify({ type: 'stderr', data: 'Error message\n' }),
        JSON.stringify({ type: 'exit', code: 1 }),
      ].join('\n');

      nock(API_URL)
        .post('/sprites/sprite-123/exec', { command: 'bad-command' })
        .reply(200, execResponse);

      const client = new SpritesClient(TOKEN);
      const result = await client.exec({
        spriteId: 'sprite-123',
        command: 'bad-command',
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Error message');
    });

    it('should pass workdir option', async () => {
      const execResponse = JSON.stringify({ type: 'exit', code: 0 });

      nock(API_URL)
        .post('/sprites/sprite-123/exec', { command: 'pwd', workdir: '/app' })
        .reply(200, execResponse);

      const client = new SpritesClient(TOKEN);
      const result = await client.exec({
        spriteId: 'sprite-123',
        command: 'pwd',
        workdir: '/app',
      });

      expect(result.exitCode).toBe(0);
    });

    it('should handle exec API error', async () => {
      nock(API_URL)
        .post('/sprites/sprite-123/exec')
        .reply(500, 'Internal Server Error');

      const client = new SpritesClient(TOKEN);

      await expect(client.exec({
        spriteId: 'sprite-123',
        command: 'echo test',
      })).rejects.toMatchObject({
        status: 500,
      });
    });
  });

  describe('authorization header', () => {
    it('should include Bearer token in requests', async () => {
      nock(API_URL, {
        reqheaders: {
          authorization: 'Bearer test-token',
        },
      })
        .get('/sprites/sprite-123')
        .reply(200, { id: 'sprite-123', name: 'test', status: 'running', createdAt: '', updatedAt: '' });

      const client = new SpritesClient(TOKEN);
      await client.getSprite('sprite-123');

      // If we get here without error, the header was matched
      expect(true).toBe(true);
    });
  });
});
