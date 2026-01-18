import { SpritesClient } from '../common/client';
import { RunInputs } from '../common/types';
/**
 * Get inputs for the run action
 */
export declare function getInputs(): RunInputs;
/**
 * Validate required inputs
 */
export declare function validateInputs(inputs: RunInputs): void;
/**
 * Check if step should be skipped based on existing checkpoint
 */
export declare function shouldSkipStep(client: SpritesClient, spriteId: string, runId: string, jobKey: string, stepKey: string): Promise<{
    skip: boolean;
    existingCheckpointId: string | null;
}>;
/**
 * Restore from checkpoint if needed
 */
export declare function maybeRestore(client: SpritesClient, spriteId: string, lastCheckpointId: string | undefined, runId: string, jobKey: string): Promise<boolean>;
/**
 * Main entry point for run action
 */
export declare function run(inputsOverride?: Partial<RunInputs>, clientFactory?: (token: string, apiUrl?: string) => SpritesClient): Promise<void>;
//# sourceMappingURL=index.d.ts.map