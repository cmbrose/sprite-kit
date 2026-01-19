import * as core from '@actions/core';
import * as github from '@actions/github';
import { Sprite, SpritesClient } from '@fly/sprites';
import {
    generateSpriteName,
    deriveJobKey,
    findLastCheckpointForJob,
    GitHubContext,
    InitInputs
} from '../common/index.js';
import { withApiRetry } from '../common/withApiRetry.js';

// Polyfill WebSocket for Node.js environment
if (typeof globalThis.WebSocket === 'undefined') {
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const ws = require('ws');
        globalThis.WebSocket = ws.WebSocket || ws.default || ws;
    } catch (error) {
        console.warn('WebSocket polyfill failed to load:', error);
    }
}

async function getOrCreateSprite(
    client: SpritesClient,
    spriteName: string,
    expectExist: boolean
): Promise<Sprite> {
    if (expectExist) {
        try {
            return await withApiRetry(() => client.getSprite(spriteName));
        } catch (error) {
            console.warn('Failed to get sprite:', error);
        }
    }

    return await withApiRetry(() => client.createSprite(spriteName));
}

/**
 * Get inputs for the init action
 */
export function getInputs(): InitInputs {
    return {
        token: core.getInput('token') || process.env.SPRITES_TOKEN,
        apiUrl: core.getInput('api-url') || process.env.SPRITES_API_URL,
        jobKey: core.getInput('job-key'),
        matrixJson: core.getInput('matrix'),
    };
}

/**
 * Build GitHub context for identity derivation
 */
export function buildGitHubContext(inputs: InitInputs, ghContext = github.context): GitHubContext {
    // Parse matrix from input if provided, otherwise try to extract from job name
    let matrix: Record<string, unknown> | undefined;
    if (inputs.matrixJson) {
        try {
            matrix = JSON.parse(inputs.matrixJson);
        } catch (error) {
            core.warning(`Failed to parse matrix JSON: ${error}`);
        }
    }

    return {
        owner: ghContext.repo.owner,
        repo: ghContext.repo.repo,
        workflow: ghContext.workflow,
        runId: ghContext.runId.toString(),
        job: ghContext.job,
        matrix,
        runAttempt: ghContext.runAttempt,
    };
}

/**
 * Main entry point for init action
 */
export async function run(
    ghContext?: typeof github.context
): Promise<void> {
    try {
        const inputs = getInputs();

        // Validate token
        if (!inputs.token) {
            throw new Error(
                'Sprites token is required. Set SPRITES_TOKEN environment variable or provide token input.'
            );
        }

        // Build context and derive identity
        const githubContext = buildGitHubContext(inputs, ghContext);
        const spriteName = generateSpriteName(githubContext);
        const jobKey = inputs.jobKey || deriveJobKey(githubContext);
        const runId = githubContext.runId;

        core.info(`Sprite name: ${spriteName}`);
        core.info(`Job key: ${jobKey}`);
        core.info(`Run ID: ${runId}`);

        // Initialize client
        const client = new SpritesClient(inputs.token, { baseURL: inputs.apiUrl });

        const sprite = await getOrCreateSprite(client, spriteName, githubContext.runAttempt > 1);

        // List existing checkpoints
        const checkpoints = await sprite.listCheckpoints();
        core.info(`Found ${checkpoints.length} existing checkpoints`);

        // Find last successful checkpoint for this job
        const lastCheckpointId = findLastCheckpointForJob(checkpoints, runId, jobKey);
        const needsRestore = lastCheckpointId !== null && checkpoints.length > 0;

        if (lastCheckpointId) {
            core.info(`Last successful checkpoint: ${lastCheckpointId}`);
        } else {
            core.info('No previous checkpoint found for this job');
        }

        // Set outputs
        core.setOutput('sprite-name', sprite.name);
        core.setOutput('job-key', jobKey);
        core.setOutput('run-id', runId);
        core.setOutput('last-checkpoint-id', lastCheckpointId || '');
        core.setOutput('needs-restore', needsRestore.toString());

        // Set environment variables for subsequent steps in the same job
        core.exportVariable('SPRITE_NAME', sprite.name);
        core.exportVariable('SPRITE_JOB_KEY', jobKey);
        core.exportVariable('SPRITE_RUN_ID', runId);
        core.exportVariable('SPRITE_LAST_CHECKPOINT_ID', lastCheckpointId || '');

        core.info('Init action completed successfully');
    } catch (error) {
        if (error instanceof Error) {
            core.setFailed(error.message);
        } else {
            core.setFailed('An unknown error occurred' + String(error));
        }
    }
}

run();