export async function withApiRetry<T>(
    fn: () => Promise<T>,
    retries: number = 2,
    delayMs: number = 1000
): Promise<T> {
    let attempt = 0;
    let lastError: any;

    while (attempt <= retries) {
        try {
            return await fn();
        } catch (error: any) {
            if (error.response && error.response.status >= 500) {
                if (attempt < retries) {
                    console.warn(`API call failed due to server error, retrying... (${retries - attempt} retries left)`);
                    attempt++;
                    await new Promise(resolve => setTimeout(resolve, attempt * delayMs));
                    continue;
                }
            }
            lastError = error;
            break;
        }
    }

    throw lastError;
}