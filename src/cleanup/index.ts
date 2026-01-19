import * as core from '@actions/core';
import { SpritesClient } from '../common/client';
import { Sprite } from '../common/types';

/**
 * Prefix used by sprite-kit to identify sprites it created
 */
const SPRITE_KIT_PREFIX = 'gh-';

/**
 * Inputs for the cleanup action
 */
interface CleanupInputs {
  spriteName?: string;
  maxAgeDays: number;
  dryRun: boolean;
  token?: string;
  apiUrl?: string;
}

/**
 * Get inputs for the cleanup action
 */
export function getInputs(): CleanupInputs {
  return {
    spriteName: core.getInput('sprite-id') || undefined,
    maxAgeDays: parseInt(core.getInput('max-age-days') || '3', 10),
    dryRun: core.getInput('dry-run') === 'true',
    token: core.getInput('token') || process.env.SPRITES_TOKEN,
    apiUrl: core.getInput('api-url') || process.env.SPRITES_API_URL,
  };
}

/**
 * Check if a sprite was created by sprite-kit (has the gh- prefix)
 */
export function isSpriteKitSprite(sprite: Sprite): boolean {
  return sprite.name.startsWith(SPRITE_KIT_PREFIX);
}

/**
 * Check if a sprite is older than the specified number of days
 */
export function isSpriteOlderThan(sprite: Sprite, days: number): boolean {
  const createdAt = new Date(sprite.created_at);
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  return createdAt < cutoffDate;
}

/**
 * Delete a specific sprite by name
 */
async function deleteSpecificSprite(
  client: SpritesClient,
  spriteName: string,
  dryRun: boolean
): Promise<string[]> {
  try {
    const sprite = await client.getSprite(spriteName);

    // Verify it's a sprite-kit sprite before deleting
    if (!isSpriteKitSprite(sprite)) {
      core.warning(
        `Sprite ${spriteName} (${sprite.name}) was not created by sprite-kit (missing '${SPRITE_KIT_PREFIX}' prefix). Skipping deletion for safety.`
      );
      return [];
    }

    if (dryRun) {
      core.info(`[DRY RUN] Would delete sprite: ${spriteName} (${sprite.name})`);
    } else {
      await client.deleteSprite(spriteName);
      core.info(`Deleted sprite: ${spriteName} (${sprite.name})`);
    }
    return [spriteName];
  } catch (error) {
    // Sprite may already be deleted or not found
    if ((error as { status?: number }).status === 404) {
      core.info(`Sprite ${spriteName} not found (may already be deleted)`);
      return [];
    }
    throw error;
  }
}

/**
 * Delete old sprites created by sprite-kit
 */
async function deleteOldSprites(
  client: SpritesClient,
  maxAgeDays: number,
  dryRun: boolean
): Promise<string[]> {
  core.info(`Looking for sprites older than ${maxAgeDays} days with prefix '${SPRITE_KIT_PREFIX}'`);

  // List sprites with prefix filter
  const response = await client.listSprites(SPRITE_KIT_PREFIX);
  
  // Fetch full sprite details for each entry to get creation dates
  const sprites: Sprite[] = [];
  for (const entry of response.sprites) {
    try {
      const sprite = await client.getSprite(entry.name);
      sprites.push(sprite);
    } catch (error) {
      core.warning(`Failed to get sprite ${entry.name}: ${error}`);
    }
  }

  // Always filter client-side to ensure we only process sprite-kit sprites
  const spriteKitSprites = sprites.filter(isSpriteKitSprite);
  core.info(`Found ${spriteKitSprites.length} sprite-kit sprites`);

  // Filter to old sprites
  const oldSprites = spriteKitSprites.filter((sprite) => isSpriteOlderThan(sprite, maxAgeDays));
  core.info(`Found ${oldSprites.length} sprites older than ${maxAgeDays} days`);

  const deletedIds: string[] = [];

  for (const sprite of oldSprites) {
    try {
      if (dryRun) {
        core.info(`[DRY RUN] Would delete sprite: ${sprite.id} (${sprite.name}, created ${sprite.created_at})`);
      } else {
        await client.deleteSprite(sprite.name);
        core.info(`Deleted sprite: ${sprite.id} (${sprite.name}, created ${sprite.created_at})`);
      }
      deletedIds.push(sprite.id);
    } catch (error) {
      core.warning(`Failed to delete sprite ${sprite.id}: ${error}`);
    }
  }

  return deletedIds;
}

/**
 * Main entry point for cleanup action
 */
export async function run(
  inputsOverride?: Partial<CleanupInputs>,
  clientFactory?: (token: string, apiUrl?: string) => SpritesClient
): Promise<void> {
  try {
    const inputs = { ...getInputs(), ...inputsOverride };

    // Validate token
    if (!inputs.token) {
      throw new Error(
        'Sprites token is required. Set SPRITES_TOKEN environment variable or provide token input.'
      );
    }

    const client = clientFactory
      ? clientFactory(inputs.token, inputs.apiUrl)
      : new SpritesClient(inputs.token, inputs.apiUrl);

    let deletedIds: string[];

    if (inputs.spriteName) {
      // Delete specific sprite
      core.info(`Deleting specific sprite: ${inputs.spriteName}`);
      deletedIds = await deleteSpecificSprite(client, inputs.spriteName, inputs.dryRun);
    } else {
      // Delete old sprites
      deletedIds = await deleteOldSprites(client, inputs.maxAgeDays, inputs.dryRun);
    }

    // Set outputs
    core.setOutput('deleted-count', deletedIds.length.toString());
    core.setOutput('deleted-sprites', JSON.stringify(deletedIds));

    if (inputs.dryRun) {
      core.info(`[DRY RUN] Would have deleted ${deletedIds.length} sprite(s)`);
    } else {
      core.info(`Cleanup completed. Deleted ${deletedIds.length} sprite(s)`);
    }
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else if (typeof error === 'object' && error !== null && 'message' in error) {
      core.setFailed(String(error.message));
    } else {
      core.setFailed('An unknown error occurred');
    }
  }
}

// Only run if this is the main module
if (require.main === module) {
  run();
}
