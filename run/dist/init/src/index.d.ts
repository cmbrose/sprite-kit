import * as github from '@actions/github';
import { GitHubContext, InitInputs } from '@sprite-kit/common';
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
export declare function run(ghContext?: typeof github.context): Promise<void>;
//# sourceMappingURL=index.d.ts.map