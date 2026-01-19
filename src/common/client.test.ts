import nock from 'nock';
import { SpritesClient } from './client';
import * as core from '@actions/core';

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

  it('should create sprite if not found', async () => {
    const sprite = {
      id: 'sprite-123',
      name: 'test-sprite',
      organization: 'test-org',
      url: 'https://test.sprites.app',
      url_settings: { auth: 'sprite' as const },
      status: 'cold' as const,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    };

    nock(API_URL).get('/sprites/test-sprite').reply(404);
    nock(API_URL).post('/sprites', { name: 'test-sprite' }).reply(201, sprite);

    const client = new SpritesClient(TOKEN);
    const result = await client.createOrGetSprite({ name: 'test-sprite' });

    expect(result).toEqual(sprite);
  });

  it('should not retry on 404', async () => {
    nock(API_URL).get('/sprites/missing').reply(404);

    const client = new SpritesClient(TOKEN);

    await expect(client.getSprite('missing')).rejects.toMatchObject({ status: 404 });
    expect(core.warning).not.toHaveBeenCalled();
  });

  it('should use Bearer token', async () => {
    const sprite = {
      id: 'sprite-123',
      name: 'test',
      organization: 'test-org',
      url: 'https://test.sprites.app',
      url_settings: { auth: 'sprite' as const },
      status: 'running' as const,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    };

    const scope = nock(API_URL, {
      reqheaders: { authorization: 'Bearer test-token' },
    }).get('/sprites/test').reply(200, sprite);

    const client = new SpritesClient(TOKEN);
    await client.getSprite('test');

    expect(scope.isDone()).toBe(true);
  });
});
