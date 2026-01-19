import * as core from '@actions/core';
import * as github from '@actions/github';
import { SpriteInfo, SpritesClient } from '@fly/sprites';
import { CleanInputs, CleanOutputs } from '../common/index.js';
import { withApiRetry } from '../common/withApiRetry.js';

// Polyfill WebSocket for Node.js environment
if (typeof globalThis.WebSocket === 'undefined') {
    try {
        const ws = require('ws');
        globalThis.WebSocket = ws.WebSocket || ws.default || ws;
    } catch (error) {
        console.warn('WebSocket polyfill failed to load:', error);
    }
}

/**
 * Get inputs for the clean action
 */
export function getInputs(): CleanInputs {
    const maxAgeInput = core.getInput('max-age') || '24';
    const dryRunInput = core.getInput('dry-run') || 'false';
    const modeInput = core.getInput('mode');

    // If mode is current or if we have environment data but no explicit inputs, use current mode
    const spriteNameFromEnv = process.env.SPRITE_NAME;

    // Auto-detect mode: if SPRITE_NAME is available (init was run), default to current mode
    // Only use global mode if explicitly requested or no sprite name available
    const mode = (modeInput as 'global' | 'current') ||
        (spriteNameFromEnv ? 'current' : 'global');

    return {
        token: core.getInput('token') || process.env.SPRITES_TOKEN,
        apiUrl: core.getInput('api-url') || process.env.SPRITES_API_URL,
        maxAge: parseInt(maxAgeInput, 10),
        dryRun: dryRunInput.toLowerCase() === 'true',
        spritePrefix: core.getInput('sprite-prefix'),
        mode,
        spriteName: core.getInput('sprite-name') || spriteNameFromEnv,
    };
}

/**
 * Validate required inputs
 */
export function validateInputs(inputs: CleanInputs): void {
    if (!inputs.token) {
        throw new Error(
            'Sprites token is required. Set SPRITES_TOKEN environment variable or provide token input.'
        );
    }

    if (inputs.mode === 'current') {
        if (!inputs.spriteName) {
            throw new Error(
                'Current mode requires sprite-name. Make sure init action was run first in this job.'
            );
        }
    } else if (inputs.mode === 'global') {
        if (isNaN(inputs.maxAge) || inputs.maxAge < 0) {
            throw new Error('max-age must be a non-negative number');
        }
    }
}

/**
 * Generate default sprite prefix based on repository
 */
export function getDefaultSpritePrefix(): string {
    const context = github.context;
    return `gh-${context.repo.owner}-${context.repo.repo}-`;
}

/**
 * Check if a sprite is old enough to be cleaned up
 */
export function isSpriteTooOld(createdAt: Date, maxAgeHours: number): boolean {
    const maxAgeMs = maxAgeHours * 60 * 60 * 1000; // Convert hours to milliseconds
    const cutoffDate = new Date(Date.now() - maxAgeMs);

    return createdAt < cutoffDate;
}

/**
 * Gets sprites that should be cleaned up
 */
export async function getSpritesToClean(
    client: SpritesClient,
    prefix: string,
    maxAgeHours: number
): Promise<SpriteInfo[]> {
    const spritesToClean = [];

    let continuationToken: string | undefined = undefined;

    while (true) {
        const sprites = await client.listSprites({
            prefix,
            continuationToken,
        });

        for (const sprite of sprites.sprites) {
            // Check if sprite is old enough
            if (isSpriteTooOld(sprite.createdAt, maxAgeHours)) {
                spritesToClean.push(sprite);
            }
        }

        if (!sprites.hasMore) {
            break;
        }

        continuationToken = sprites.nextContinuationToken;
    }

    return spritesToClean;
}

/**
 * Clean the current workflow's sprite
 */
export async function cleanCurrentSprite(
    client: SpritesClient,
    spriteName: string,
    dryRun: boolean
): Promise<{ cleaned: boolean; found: boolean }> {
    try {
        // Verify sprite exists
        const sprite = await withApiRetry(() => client.getSprite(spriteName));

        if (dryRun) {
            core.info(`Would delete current workflow sprite: ${sprite.name}`);
            return { cleaned: false, found: true };
        }

        await withApiRetry(() => client.deleteSprite(spriteName));
        core.info(`✓ Deleted current workflow sprite: ${sprite.name}`);
        return { cleaned: true, found: true };

    } catch (error) {
        core.warning(`Failed to delete current workflow sprite: ${error}`);
        return { cleaned: false, found: true };
    }
}

/**
 * Main entry point for clean action
 */
export async function clean(
    inputsOverride?: Partial<CleanInputs>
): Promise<CleanOutputs> {
    let spritesCleaned = 0;
    let spritesFound = 0;

    try {
        const inputs = { ...getInputs(), ...inputsOverride };
        validateInputs(inputs);

        const client = new SpritesClient(inputs.token!, { baseURL: inputs.apiUrl });

        if (inputs.mode === 'current') {
            // Current workflow mode - clean only the current sprite
            core.info('Running in current workflow mode');
            core.info(`Sprite Name: ${inputs.spriteName || 'N/A'}`);
            core.info(`Dry run: ${inputs.dryRun}`);

            if (!inputs.spriteName) {
                throw new Error('No sprite information found in action state. Make sure init action was run first.');
            }

            const result = await cleanCurrentSprite(
                client,
                inputs.spriteName!,
                inputs.dryRun
            );

            spritesFound = result.found ? 1 : 0;
            spritesCleaned = result.cleaned ? 1 : 0;

            const action = inputs.dryRun ? 'would be deleted' : (result.cleaned ? 'deleted' : 'failed to delete');
            core.info(`Current workflow sprite ${action}`);

        } else {
            // Global mode - clean old sprites by age and prefix
            core.info('Running in global cleanup mode');

            // Determine sprite prefix - use input or default to repo-specific prefix
            const spritePrefix = inputs.spritePrefix || getDefaultSpritePrefix();

            core.info(`Looking for sprites with prefix: ${spritePrefix}`);
            core.info(`Max age: ${inputs.maxAge} hours`);
            core.info(`Dry run: ${inputs.dryRun}`);

            // Get sprites that should be cleaned
            const spritesToClean = await getSpritesToClean(client, spritePrefix, inputs.maxAge);
            spritesFound = spritesToClean.length;

            if (spritesFound === 0) {
                core.info('No old sprites found to clean up');
                return { spritesCleaned: 0, spritesFound: 0, dryRun: inputs.dryRun, mode: inputs.mode! };
            }

            core.info(`Found ${spritesFound} old sprites to clean up`);

            if (inputs.dryRun) {
                core.startGroup('Sprites that would be deleted (dry run)');
                for (const sprite of spritesToClean) {
                    core.info(`- ${sprite.name} - created ${sprite.createdAt}`);
                }
                core.endGroup();
                return { spritesCleaned: 0, spritesFound, dryRun: true, mode: inputs.mode! };
            }

            // Actually delete the sprites
            core.startGroup('Deleting old sprites');
            const deletePromises = spritesToClean.map(async (sprite) => {
                try {
                    await client.deleteSprite(sprite.name);
                    core.info(`✓ Deleted sprite: ${sprite.name}`);
                    return true;
                } catch (error) {
                    core.warning(`✗ Failed to delete sprite ${sprite.name}: ${error}`);
                    return false;
                }
            });

            const results = await Promise.all(deletePromises);
            spritesCleaned = results.filter(success => success).length;
            core.endGroup();

            const failed = spritesFound - spritesCleaned;
            if (failed > 0) {
                core.warning(`${failed} sprites failed to delete`);
            }

            core.info(`Successfully cleaned up ${spritesCleaned} out of ${spritesFound} old sprites`);
        }

        return { spritesCleaned, spritesFound, dryRun: inputs.dryRun, mode: inputs.mode! };

    } catch (error) {
        if (error instanceof Error) {
            core.setFailed(error.message);
        } else {
            core.setFailed('An unknown error occurred: ' + String(error));
        }
        throw error;
    }
}

/**
 * Main action entry point
 */
export async function run(inputsOverride?: Partial<CleanInputs>): Promise<void> {
    try {
        const result = await clean(inputsOverride);

        // Set outputs
        core.setOutput('sprites-cleaned', result.spritesCleaned.toString());
        core.setOutput('sprites-found', result.spritesFound.toString());
        core.setOutput('dry-run', result.dryRun.toString());
        core.setOutput('mode', result.mode);

    } catch (error) {
        // Error handling already done in clean() function
        // Just ensure we don't throw again
    }
}

run();