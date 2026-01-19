import { Sprite } from '@fly/sprites';
import { RunInputs } from '@sprite-kit/common';
/**
 * Get inputs for the run action
 */
export declare function getInputs(): Partial<RunInputs>;
/**
 * Validate required inputs
 */
export declare function validateInputs(inputs: Partial<RunInputs>): RunInputs;
/**
 * Check if step should be skipped based on existing checkpoint
 */
export declare function shouldSkipStep(sprite: Sprite, runId: string, jobKey: string, stepKey: string): Promise<{
    skip: boolean;
    existingCheckpointId: string | null;
}>;
/**
 * Restore from checkpoint if needed
 */
export declare function maybeRestore(sprite: Sprite, lastCheckpointId: string | undefined, runId: string, jobKey: string, stepKey: string): Promise<boolean>;
/**
 * Main entry point for run action
 */
export declare function run(inputsOverride?: Partial<RunInputs>): Promise<void>;
//# sourceMappingURL=index.d.ts.map