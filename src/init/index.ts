import * as core from '@actions/core';
import * as github from '@actions/github';
import { SpritesClient } from '../common/client';
import {
  deriveSpriteNameFromContext,
  deriveJobKey,
  findLastCheckpointForJob,
} from '../common/identity';
import { GitHubContext, InitInputs } from '../common/types';

/**
 * Get inputs for the init action
 */
function getInputs(): InitInputs {
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
function buildGitHubContext(inputs: InitInputs): GitHubContext {
  const context = github.context;

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
    owner: context.repo.owner,
    repo: context.repo.repo,
    workflow: context.workflow,
    runId: context.runId.toString(),
    job: context.job,
    matrix,
  };
}

/**
 * Main entry point for init action
 */
async function run(): Promise<void> {
  try {
    const inputs = getInputs();

    // Validate token
    if (!inputs.token) {
      throw new Error(
        'Sprites token is required. Set SPRITES_TOKEN environment variable or provide token input.'
      );
    }

    // Build context and derive identity
    const githubContext = buildGitHubContext(inputs);
    const spriteName = deriveSpriteNameFromContext(githubContext);
    const jobKey = inputs.jobKey || deriveJobKey(githubContext);
    const runId = githubContext.runId;

    core.info(`Sprite name: ${spriteName}`);
    core.info(`Job key: ${jobKey}`);
    core.info(`Run ID: ${runId}`);

    // Initialize client
    const client = new SpritesClient(inputs.token, inputs.apiUrl);

    // Create or get sprite
    const sprite = await client.createOrGetSprite({ name: spriteName });

    // List existing checkpoints
    const checkpoints = await client.listCheckpoints(sprite.id);
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
    core.setOutput('sprite-name', spriteName);
    core.setOutput('sprite-id', sprite.id);
    core.setOutput('job-key', jobKey);
    core.setOutput('run-id', runId);
    core.setOutput('last-checkpoint-id', lastCheckpointId || '');
    core.setOutput('needs-restore', needsRestore.toString());

    // Export state for run action
    core.saveState('sprite-id', sprite.id);
    core.saveState('job-key', jobKey);
    core.saveState('run-id', runId);
    core.saveState('last-checkpoint-id', lastCheckpointId || '');

    core.info('Init action completed successfully');
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed('An unknown error occurred');
    }
  }
}

run();
