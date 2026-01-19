import { SpriteInfo, SpritesClient } from '@fly/sprites';
import { CleanInputs, CleanOutputs } from '@sprite-kit/common';
/**
 * Get inputs for the clean action
 */
export declare function getInputs(): CleanInputs;
/**
 * Validate required inputs
 */
export declare function validateInputs(inputs: CleanInputs): void;
/**
 * Generate default sprite prefix based on repository
 */
export declare function getDefaultSpritePrefix(): string;
/**
 * Check if a sprite is old enough to be cleaned up
 */
export declare function isSpriteTooOld(createdAt: Date, maxAgeHours: number): boolean;
/**
 * Gets sprites that should be cleaned up
 */
export declare function getSpritesToClean(client: SpritesClient, prefix: string, maxAgeHours: number): Promise<SpriteInfo[]>;
/**
 * Clean the current workflow's sprite
 */
export declare function cleanCurrentSprite(client: SpritesClient, spriteName: string, dryRun: boolean): Promise<{
    cleaned: boolean;
    found: boolean;
}>;
/**
 * Main entry point for clean action
 */
export declare function clean(inputsOverride?: Partial<CleanInputs>): Promise<CleanOutputs>;
/**
 * Main action entry point
 */
export declare function run(inputsOverride?: Partial<CleanInputs>): Promise<void>;
//# sourceMappingURL=index.d.ts.map