import * as core from '@actions/core';
import { Sprite, SpritesClient } from '@fly/sprites';
import {
    formatCheckpointComment,
    findCheckpointForStep,
    parseCheckpointComment,
    RunInputs,
    createCheckpoint,
    restoreCheckpoint,
    CheckpointMetadata,
    metadataEquals,
} from '../common/index.js';
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
 * Get inputs for the run action
 */
export function getInputs(): Partial<RunInputs> {
    return {
        stepKey: core.getInput('step-key', { required: true }),
        run: core.getInput('run', { required: true }),
        token: core.getInput('token') || process.env.SPRITES_TOKEN,
        apiUrl: core.getInput('api-url') || process.env.SPRITES_API_URL,
        spriteName: core.getInput('sprite-name') || process.env.SPRITE_NAME,
        jobKey: core.getInput('job-key') || process.env.SPRITE_JOB_KEY,
        runId: core.getInput('run-id') || process.env.SPRITE_RUN_ID,
        lastCheckpointId: core.getInput('last-checkpoint-id') || process.env.SPRITE_LAST_CHECKPOINT_ID,
        workdir: core.getInput('workdir'),
    };
}

/**
 * Validate required inputs
 */
export function validateInputs(inputs: Partial<RunInputs>): RunInputs {
    if (!inputs.token) {
        throw new Error(
            'Sprites token is required. Set SPRITES_TOKEN environment variable or provide token input.'
        );
    }
    if (!inputs.spriteName) {
        throw new Error(
            'Sprite name is required. Run init action first or provide sprite-name input.'
        );
    }
    if (!inputs.jobKey) {
        throw new Error(
            'Job key is required. Run init action first or provide job-key input.'
        );
    }
    if (!inputs.runId) {
        throw new Error(
            'Run ID is required. Run init action first or provide run-id input.'
        );
    }
    return inputs as RunInputs;
}

/**
 * Check if step should be skipped based on existing checkpoint
 */
export async function shouldSkipStep(
    sprite: Sprite,
    runId: string,
    jobKey: string,
    stepKey: string
): Promise<{ skip: boolean; existingCheckpointId: string | null }> {
    const checkpoints = await sprite.listCheckpoints();
    const existingCheckpointId = findCheckpointForStep(checkpoints, runId, jobKey, stepKey);

    return {
        skip: existingCheckpointId !== null,
        existingCheckpointId,
    };
}

/**
 * Restore from checkpoint if needed
 */
export async function maybeRestore(
    sprite: Sprite,
    lastCheckpointId: string | undefined,
    currentCheckpointMetadata: CheckpointMetadata
): Promise<boolean> {
    if (!lastCheckpointId) {
        return false;
    }

    try {
        // Verify checkpoint belongs to this run/job
        const checkpoint = await sprite.getCheckpoint(lastCheckpointId);
        const metadata = parseCheckpointComment(checkpoint.comment!);

        if (!metadata || !metadataEquals(metadata, currentCheckpointMetadata)) {
            return false;
        }

        core.info(`Restoring from checkpoint: ${lastCheckpointId}`);
        await restoreCheckpoint(sprite, lastCheckpointId);
        return true;
    } catch (error) {
        core.warning(`Failed to restore checkpoint: ${error}`);
        return false;
    }
}

/**
 * Main entry point for run action
 */
export async function run(
    inputsOverride?: Partial<RunInputs>,
): Promise<void> {
    let restored = false;
    let skipped = false;
    let checkpointId = '';
    let exitCode = 0;

    try {
        const maybeInputs = { ...getInputs(), ...inputsOverride };
        const inputs = validateInputs(maybeInputs);

        const client = new SpritesClient(inputs.token!, { baseURL: inputs.apiUrl });
        const { spriteName, runId, jobKey, stepKey, lastCheckpointId } = inputs;

        core.info(`Step key: ${stepKey}`);
        core.info(`Sprite name: ${spriteName}`);

        const sprite = await withApiRetry(() => client.getSprite(spriteName));

        // Restore from last checkpoint if this is a rerun (must happen before skip check)
        const currentCheckpointMetadata: CheckpointMetadata = { runId, jobKey, stepKey };
        restored = await maybeRestore(sprite, lastCheckpointId, currentCheckpointMetadata);

        // Check if step should be skipped
        const { skip, existingCheckpointId } = await shouldSkipStep(
            sprite,
            runId,
            jobKey,
            stepKey
        );

        if (skip && existingCheckpointId) {
            core.info(`Step "${stepKey}" already completed, skipping execution`);
            skipped = true;
            checkpointId = existingCheckpointId;
            return;
        }

        // Execute the command
        core.info(`Executing step: ${stepKey}`);
        core.startGroup(`Running command:`);

        const command = sprite.spawn('/bin/bash', ['-c', inputs.run], {
            cwd: inputs.workdir,
        });

        command.stdout.on('data', (data: Buffer) => {
            core.info("out: " + data.toString());
        });

        command.stderr.on('data', (data: Buffer) => {
            core.error("err: " + data.toString());
        });

        exitCode = await command.wait();

        if (exitCode !== 0) {
            throw new Error(`Command exited with code ${exitCode}`);
        }

        core.endGroup();

        // Create checkpoint on success
        const comment = formatCheckpointComment({ runId, jobKey, stepKey });
        checkpointId = await createCheckpoint(sprite, comment);

        // Update environment for subsequent steps
        core.exportVariable('SPRITE_LAST_CHECKPOINT_ID', checkpointId);

        core.info(`Step "${stepKey}" completed successfully`);
    } catch (error) {
        if (error instanceof Error) {
            core.setFailed(error.message);
        } else {
            core.setFailed('An unknown error occurred: ' + String(error));
        }
    } finally {
        core.setOutput('checkpoint-id', checkpointId);
        core.setOutput('skipped', skipped.toString());
        core.setOutput('restored', restored.toString());
        core.setOutput('exit-code', exitCode.toString());
    }
}

run();