import * as core from '@actions/core';
import { Sprite, SpritesClient } from '@fly/sprites';
import {
    formatCheckpointComment,
    findCheckpointForStep,
    parseCheckpointComment,
    RunInputs,
    processCheckpointStream,
} from '@sprite-kit/common';

/**
 * Get inputs for the run action
 */
export function getInputs(): RunInputs {
    return {
        stepKey: core.getInput('step-key', { required: true }),
        run: core.getInput('run', { required: true }),
        token: core.getInput('token') || process.env.SPRITES_TOKEN,
        apiUrl: core.getInput('api-url') || process.env.SPRITES_API_URL,
        spriteName: core.getInput('sprite-name') || core.getState('sprite-name'),
        jobKey: core.getInput('job-key') || core.getState('job-key'),
        runId: core.getInput('run-id') || core.getState('run-id'),
        lastCheckpointId: core.getInput('last-checkpoint-id') || core.getState('last-checkpoint-id'),
        workdir: core.getInput('workdir'),
    };
}

/**
 * Validate required inputs
 */
export function validateInputs(inputs: RunInputs): void {
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
    runId: string,
    jobKey: string
): Promise<boolean> {
    if (!lastCheckpointId) {
        return false;
    }

    try {
        // Verify checkpoint belongs to this run/job
        const checkpoint = await sprite.getCheckpoint(lastCheckpointId);
        const metadata = parseCheckpointComment(checkpoint.comment!);

        if (!metadata || metadata.runId !== runId || metadata.jobKey !== jobKey) {
            core.warning('Checkpoint does not match current run/job, skipping restore');
            return false;
        }

        core.info(`Restoring from checkpoint: ${lastCheckpointId}`);
        await sprite.restoreCheckpoint(lastCheckpointId);
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
        const inputs = { ...getInputs(), ...inputsOverride };
        validateInputs(inputs);

        const client = new SpritesClient(inputs.token!, { baseURL: inputs.apiUrl });
        const { spriteName, runId, jobKey, stepKey, lastCheckpointId } = inputs;

        core.info(`Step key: ${stepKey}`);
        core.info(`Sprite name: ${spriteName}`);

        const sprite = await client.getSprite(spriteName!);

        // Restore from last checkpoint if this is a rerun (must happen before skip check)
        restored = await maybeRestore(sprite, lastCheckpointId, runId, jobKey);

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
        core.startGroup(`Running: ${inputs.run}`);

        try {
            const result = await sprite.exec(
                inputs.run,
                {
                    cwd: inputs.workdir,
                });

            exitCode = result.exitCode;
            core.endGroup();

            if (exitCode !== 0) {
                throw new Error(`Command exited with code ${exitCode}`);
            }
        } catch (execError) {
            core.endGroup();
            throw execError;
        }

        // Create checkpoint on success
        const comment = formatCheckpointComment({ runId, jobKey, stepKey });
        const checkpointResponse = await sprite.createCheckpoint(comment);
        checkpointId = await processCheckpointStream(checkpointResponse);

        // Update state for subsequent steps
        core.saveState('last-checkpoint-id', checkpointId);

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

// Only run if this is the main module
if (require.main === module) {
    run();
}