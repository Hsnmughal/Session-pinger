import type {PingConfig, StoredConfig} from './types.ts';

const DEFAULT_SERVER = 'https://ntfy.sh';
const DEFAULT_THRESHOLD_MS = 60_000;

export interface ResolveConfigInput {
	readonly stored?: StoredConfig;
	readonly env?: Readonly<Record<string, string | undefined>>;
}

const readString = (value: unknown): string | undefined => {
	if (typeof value !== 'string') return undefined;
	const trimmed = value.trim();
	return trimmed === '' ? undefined : trimmed;
};

const readPositiveMs = (value: unknown): number | undefined => {
	const parsed = typeof value === 'string' ? Number(value) : value;
	if (typeof parsed !== 'number' || !Number.isFinite(parsed) || parsed <= 0) return undefined;
	return parsed;
};

export function resolveConfig({stored, env = {}}: ResolveConfigInput): PingConfig | undefined {
	const topic = readString(env.SESSION_PING_TOPIC) ?? readString(stored?.topic);
	if (topic === undefined) return undefined;

	const base = readString(env.SESSION_PING_SERVER) ?? readString(stored?.server) ?? DEFAULT_SERVER;
	const server = base.replace(/\/+$/, '');
	const thresholdMs =
		readPositiveMs(env.SESSION_PING_THRESHOLD_MS) ??
		readPositiveMs(stored?.thresholdMs) ??
		DEFAULT_THRESHOLD_MS;
	const token = readString(env.SESSION_PING_TOKEN) ?? readString(stored?.token);

	return token === undefined ? {server, topic, thresholdMs} : {server, topic, thresholdMs, token};
}

export function parseThreshold(raw: string): number | undefined {
	const match = /^(\d+(?:\.\d+)?)(ms|s|m|h)?$/.exec(raw.trim());
	if (match === null) return undefined;
	const amount = Number(match[1]);
	const unit = match[2] ?? 's';
	const multiplier = unit === 'ms' ? 1 : unit === 's' ? 1_000 : unit === 'm' ? 60_000 : 3_600_000;
	const ms = Math.round(amount * multiplier);
	return ms > 0 ? ms : undefined;
}
