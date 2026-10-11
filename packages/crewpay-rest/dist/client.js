/**
 * Minimal CrewPay REST client for framework plugins.
 * Keys from env only — never accept private keys as function arguments.
 *
 * Spend gate: POST /api/agent/launch/dry-run returns dryRunId + approvalUrl
 * (no approve secret). Operator opens approvalUrl and wallet-signs.
 * Launch/wire require dryRunId after approval. Image content is bound by sha256.
 */
export const DEFAULT_API_URL = 'https://api.crewpay.dev';
export function loadCrewPayEnv(overrides = {}) {
    return {
        apiUrl: (overrides.apiUrl || process.env.CREW_API_URL || DEFAULT_API_URL).replace(/\/$/, ''),
        apiKey: overrides.apiKey ||
            process.env.CREWPAY_API_KEY?.trim() ||
            process.env.CREW_AGENT_API_KEY?.trim() ||
            '',
        launcherKey: overrides.launcherKey ||
            process.env.CREW_LAUNCHER_KEY?.trim() ||
            '',
    };
}
export class CrewPayClient {
    env;
    constructor(env = loadCrewPayEnv()) {
        this.env = env;
    }
    headers(opts) {
        const h = new Headers({ accept: 'application/json', 'content-type': 'application/json' });
        if (this.env.apiKey)
            h.set('x-crew-api-key', this.env.apiKey);
        if (opts?.launcher) {
            if (!this.env.launcherKey) {
                throw new Error('Missing CREW_LAUNCHER_KEY in env — use a dedicated low-SOL burner. Never pass secrets as arguments.');
            }
            h.set('x-launcher-key', this.env.launcherKey);
        }
        return h;
    }
    async fetch(path, init) {
        const headers = this.headers({ launcher: init?.launcher });
        if (init?.auth && !this.env.apiKey) {
            throw new Error('Missing CREWPAY_API_KEY / CREW_AGENT_API_KEY — claim via POST /api/agent/keys/claim');
        }
        const res = await fetch(`${this.env.apiUrl}${path}`, { ...init, headers });
        const text = await res.text();
        let json = null;
        try {
            json = text ? JSON.parse(text) : null;
        }
        catch {
            json = { raw: text.slice(0, 500) };
        }
        if (!res.ok) {
            const err = typeof json === 'object' && json && 'error' in json
                ? String(json.error)
                : text.slice(0, 300);
            throw new Error(`CREW API ${res.status}: ${err}`);
        }
        return json;
    }
    discover() {
        return this.fetch('/api/agent');
    }
    claimKey(body = {}) {
        return this.fetch('/api/agent/keys/claim', {
            method: 'POST',
            body: JSON.stringify({ label: 'agent', ...body }),
        });
    }
    autohire(body) {
        return this.fetch('/api/agent/autohire', {
            method: 'POST',
            auth: true,
            body: JSON.stringify(body),
        });
    }
    /** Server dry-run — returns plan + dryRunId + approvalUrl (no approve secret). */
    dryRun(body) {
        return this.fetch('/api/agent/launch/dry-run', {
            method: 'POST',
            auth: true,
            body: JSON.stringify(body),
        });
    }
    launch(body, opts) {
        const dryRunId = String(opts.dryRunId || '').trim();
        if (!dryRunId) {
            throw new Error('Launch blocked: dryRunId required — dry-run, operator wallet-approves on approvalUrl, then launch');
        }
        return this.fetch('/api/agent/launch', {
            method: 'POST',
            auth: true,
            launcher: true,
            body: JSON.stringify({ ...body, dryRunId }),
        });
    }
    wireFees(body, opts) {
        const dryRunId = String(opts.dryRunId || '').trim();
        if (!dryRunId) {
            throw new Error('Wire-fees blocked: dryRunId required — dry-run with intent=wire-fees, wallet-approve, then wire');
        }
        return this.fetch('/api/agent/wire-fees', {
            method: 'POST',
            auth: true,
            launcher: true,
            body: JSON.stringify({ ...body, dryRunId }),
        });
    }
    crank(body) {
        return this.fetch('/api/agent/crank', {
            method: 'POST',
            auth: true,
            body: JSON.stringify(body),
        });
    }
    proof() {
        return this.fetch('/api/proof');
    }
}
