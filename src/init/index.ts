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
  };
}

/**
 * Main entry point for init action
 */
export async function run(
  clientFactory?: (token: string, apiUrl?: string) => SpritesClient,
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
    const spriteName = deriveSpriteNameFromContext(githubContext);
    const jobKey = inputs.jobKey || deriveJobKey(githubContext);
    const runId = githubContext.runId;

    core.info(`Sprite name: ${spriteName}`);
    core.info(`Job key: ${jobKey}`);
    core.info(`Run ID: ${runId}`);

    // Initialize client
    const client = clientFactory
      ? clientFactory(inputs.token, inputs.apiUrl)
      : new SpritesClient(inputs.token, inputs.apiUrl);

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

// Only run if this is the main module
if (require.main === module) {
  run();
}
