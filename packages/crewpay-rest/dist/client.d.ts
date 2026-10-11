/**
 * Minimal CrewPay REST client for framework plugins.
 * Keys from env only — never accept private keys as function arguments.
 *
 * Approval is optional. Operators can require human approval per key.
 * When requireApproval is off (default), launch/wire work with the API key alone.
 * dryRunId is optional; when sent it is validated. Image content is bound by sha256 when dry-running.
 */
export declare const DEFAULT_API_URL = "https://api.crewpay.dev";
export type CrewPayEnv = {
    apiUrl?: string;
    apiKey?: string;
    launcherKey?: string;
};
export declare function loadCrewPayEnv(overrides?: CrewPayEnv): Required<Pick<CrewPayEnv, 'apiUrl'>> & CrewPayEnv;
export declare class CrewPayClient {
    private readonly env;
    constructor(env?: ReturnType<typeof loadCrewPayEnv>);
    private headers;
    fetch(path: string, init?: RequestInit & {
        auth?: boolean;
        launcher?: boolean;
    }): Promise<unknown>;
    discover(): Promise<unknown>;
    claimKey(body?: {
        label?: string;
        agentName?: string;
        model?: string;
        referralCode?: string;
    }): Promise<unknown>;
    autohire(body: Record<string, unknown>): Promise<unknown>;
    /** Server dry-run — returns plan + dryRunId + approvalUrl (no approve secret). */
    dryRun(body: Record<string, unknown>): Promise<unknown>;
    launch(body: Record<string, unknown>, opts?: {
        dryRunId?: string;
    }): Promise<unknown>;
    wireFees(body: {
        mint: string;
        mode?: string;
        crew?: unknown[];
        name?: string;
        ticker?: string;
    }, opts?: {
        dryRunId?: string;
    }): Promise<unknown>;
    crank(body: {
        mint: string;
    }): Promise<unknown>;
    proof(): Promise<unknown>;
}
