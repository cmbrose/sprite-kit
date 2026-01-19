import { SpritesClient } from '../common/client';
import { Sprite } from '../common/types';
/**
 * Inputs for the cleanup action
 */
interface CleanupInputs {
    spriteName?: string;
    maxAgeDays: number;
    dryRun: boolean;
    token?: string;
    apiUrl?: string;
}
/**
 * Get inputs for the cleanup action
 */
export declare function getInputs(): CleanupInputs;
/**
 * Check if a sprite was created by sprite-kit (has the gh- prefix)
 */
export declare function isSpriteKitSprite(sprite: Sprite): boolean;
/**
 * Check if a sprite is older than the specified number of days
 */
export declare function isSpriteOlderThan(sprite: Sprite, days: number): boolean;
/**
 * Main entry point for cleanup action
 */
export declare function run(inputsOverride?: Partial<CleanupInputs>, clientFactory?: (token: string, apiUrl?: string) => SpritesClient): Promise<void>;
export {};
//# sourceMappingURL=index.d.ts.map