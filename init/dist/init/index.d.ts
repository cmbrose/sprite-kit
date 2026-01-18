import * as github from '@actions/github';
import { SpritesClient } from '../common/client';
import { GitHubContext, InitInputs } from '../common/types';
/**
 * Get inputs for the init action
 */
export declare function getInputs(): InitInputs;
/**
 * Build GitHub context for identity derivation
 */
export declare function buildGitHubContext(inputs: InitInputs, ghContext?: import("@actions/github/lib/context").Context): GitHubContext;
/**
 * Main entry point for init action
 */
export declare function run(clientFactory?: (token: string, apiUrl?: string) => SpritesClient, ghContext?: typeof github.context): Promise<void>;
//# sourceMappingURL=index.d.ts.map