import * as core from '@actions/core';

export async function withApiRetry<T>(
    fn: () => Promise<T>,
    retries: number = 2,
    delayMs: number = 1000
): Promise<T> {
    let attempt = 0;

    while (true) {
        attempt++;

        try {
            return await fn();
        } catch (error) {
            const err = error as { response?: { status?: number } };
            if (err.response && err.response.status && err.response.status >= 500) {
                core.warning(`API call failed due to server error, retrying... (${retries - attempt} retries left)`);
                await new Promise(resolve => setTimeout(resolve, attempt * delayMs));

                if (attempt > retries) {
                    throw error;
                }
            } else {
                throw error;
            }
        }
    }
}