import * as core from '@actions/core';
import { SpritesClient } from '../common/client';
import {
  formatCheckpointComment,
  findCheckpointForStep,
  parseCheckpointComment,
} from '../common/identity';
import { RunInputs } from '../common/types';

/**
 * Get inputs for the run action
 */
export function getInputs(): RunInputs {
  return {
    stepKey: core.getInput('step-key', { required: true }),
    run: core.getInput('run', { required: true }),
    token: core.getInput('token') || process.env.SPRITES_TOKEN,
    apiUrl: core.getInput('api-url') || process.env.SPRITES_API_URL,
    spriteName: core.getInput('sprite-id') || core.getState('sprite-id'),
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
      'Sprite ID is required. Run init action first or provide sprite-id input.'
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
  client: SpritesClient,
  spriteName: string,
  runId: string,
  jobKey: string,
  stepKey: string
): Promise<{ skip: boolean; existingCheckpointId: string | null }> {
  const checkpoints = await client.listCheckpoints(spriteName);
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
  client: SpritesClient,
  spriteName: string,
  lastCheckpointId: string | undefined,
  runId: string,
  jobKey: string
): Promise<boolean> {
  if (!lastCheckpointId) {
    return false;
  }

  try {
    // Verify checkpoint belongs to this run/job
    const checkpoint = await client.getCheckpoint(spriteName, lastCheckpointId);
    const metadata = parseCheckpointComment(checkpoint.comment);

    if (!metadata || metadata.runId !== runId || metadata.jobKey !== jobKey) {
      core.warning('Checkpoint does not match current run/job, skipping restore');
      return false;
    }

    core.info(`Restoring from checkpoint: ${lastCheckpointId}`);
    await client.restoreCheckpoint(spriteName, lastCheckpointId);
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
  clientFactory?: (token: string, apiUrl?: string) => SpritesClient
): Promise<void> {
  let restored = false;
  let skipped = false;
  let checkpointId = '';
  let exitCode = 0;

  try {
    const inputs = { ...getInputs(), ...inputsOverride };
    validateInputs(inputs);

    const client = clientFactory
      ? clientFactory(inputs.token!, inputs.apiUrl)
      : new SpritesClient(inputs.token!, inputs.apiUrl);
    const { spriteName, runId, jobKey, stepKey, lastCheckpointId } = inputs;

    core.info(`Step key: ${stepKey}`);
    core.info(`Sprite ID: ${spriteName}`);

    // Check if step should be skipped
    const { skip, existingCheckpointId } = await shouldSkipStep(
      client,
      spriteName,
      runId,
      jobKey,
      stepKey
    );

    if (skip && existingCheckpointId) {
      core.info(`Step "${stepKey}" already completed, skipping execution`);
      skipped = true;
      checkpointId = existingCheckpointId;

      // Set outputs and return early
      core.setOutput('skipped', 'true');
      core.setOutput('checkpoint-id', checkpointId);
      core.setOutput('restored', 'false');
      core.setOutput('exit-code', '0');
      return;
    }

    // Restore from last checkpoint if this is a rerun
    restored = await maybeRestore(client, spriteName, lastCheckpointId, runId, jobKey);

    // Execute the command
    core.info(`Executing step: ${stepKey}`);
    core.startGroup(`Running: ${inputs.run}`);

    try {
      const result = await client.exec({
        spriteName,
        command: inputs.run,
        workdir: inputs.workdir || undefined,
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
    const comment = formatCheckpointComment(runId, jobKey, stepKey);
    const checkpoint = await client.createCheckpoint({
      spriteName,
      comment,
    });
    checkpointId = checkpoint.id;

    // Update state for subsequent steps
    core.saveState('last-checkpoint-id', checkpointId);

    core.info(`Step "${stepKey}" completed successfully`);

    // Set outputs
    core.setOutput('skipped', 'false');
    core.setOutput('checkpoint-id', checkpointId);
    core.setOutput('restored', restored.toString());
    core.setOutput('exit-code', exitCode.toString());
  } catch (error) {
    // Set outputs even on failure
    core.setOutput('skipped', skipped.toString());
    core.setOutput('checkpoint-id', checkpointId);
    core.setOutput('restored', restored.toString());
    core.setOutput('exit-code', exitCode.toString());

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
