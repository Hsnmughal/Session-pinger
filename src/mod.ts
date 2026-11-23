import {parseThreshold, resolveConfig} from './config.ts';
import {formatDuration} from './duration.ts';
import {httpFetch, publishRun} from './deliver.ts';
import type {FetchLike, ModLike, PingConfig, RunEndEvent, StoredConfig} from './types.ts';

export interface SessionPingOptions {
	readonly env?: Readonly<Record<string, string | undefined>>;
	readonly now?: () => number;
	readonly fetchImpl?: FetchLike;
}

const STORE_KEY = 'config';
const DEFAULT_TITLE = 'Command Code run finished';

const OFF_MESSAGE = 'Phone ping is off. Set it up with /ping-setup topic=<topic>.';
const USAGE =
	'Usage: /ping-setup topic=<ntfy-topic> [server=https://ntfy.sh] [threshold=60s] [token=<token>] — or /ping-setup off';

const SETTABLE_KEYS = new Set(['topic', 'server', 'token']);

export function createSessionPing(api: ModLike, options: SessionPingOptions = {}): void {
	const env = options.env ?? {};
	const now = options.now ?? (() => Date.now());
	const fetchImpl = options.fetchImpl ?? httpFetch;
	const title = DEFAULT_TITLE;

	const readStored = (): StoredConfig | undefined => {
		const value = api.store.get<StoredConfig>(STORE_KEY);
		return typeof value === 'object' && value !== null ? value : undefined;
	};

	const currentConfig = (): PingConfig | undefined => resolveConfig({stored: readStored(), env});

	const describe = (config: PingConfig): string => {
		const threshold = `only runs ≥ ${formatDuration(config.thresholdMs)}`;
		const token = config.token === undefined ? '' : ' · token set';
		return `Phone ping → ${config.server}/${config.topic} · ${threshold}${token}`;
	};

	const applySetup = (args: string): {message: string} => {
		const input = args.trim();
		if (input === 'off') {
			void api.store.delete(STORE_KEY);
			return {message: OFF_MESSAGE};
		}
		if (input === '') return {message: USAGE};

		const stored: Record<string, unknown> = {...readStored()};
		for (const part of input.split(/\s+/)) {
			const separator = part.indexOf('=');
			if (separator === -1) continue;
			const key = part.slice(0, separator);
			const value = part.slice(separator + 1);

			if (key === 'threshold') {
				const ms = parseThreshold(value);
				if (ms !== undefined) stored.thresholdMs = ms;
			} else if (SETTABLE_KEYS.has(key)) {
				stored[key] = value;
			}
		}

		const config = resolveConfig({stored: stored as StoredConfig, env});
		if (config === undefined) {
			return {
				message: 'Nothing saved: a topic is required, e.g. /ping-setup topic=my-topic.',
			};
		}

		void api.store.set(STORE_KEY, stored);
		return {message: describe(config)};
	};

	const sendTest = async (): Promise<{message: string}> => {
		const config = currentConfig();
		if (config === undefined) {
			return {message: 'Phone ping is not set up yet — run /ping-setup topic=<topic> first.'};
		}
		const outcome = await publishRun(
			{stopReason: 'end_turn', finalText: 'Test notification from Session-pinger.'},
			0,
			{config, fetchImpl, title, cwd: api.cwd},
		);
		return {
			message: outcome.published
				? `Test notification sent to ${config.server}/${config.topic}. Check your phone.`
				: `Test failed (${outcome.reason}). Check the topic and your network.`,
		};
	};

	api.addCommand({
		name: 'ping',
		description: 'Show whether long-run phone notifications are on',
		handler: () => {
			const config = currentConfig();
			return {message: config === undefined ? OFF_MESSAGE : describe(config)};
		},
	});

	api.addCommand({
		name: 'ping-setup',
		description: 'Configure the ntfy phone notification',
		argumentHint: 'topic=<ntfy-topic> [server=<url>] [threshold=30s] [token=<token>] | off',
		handler: ({args}) => applySetup(args),
	});

	api.addCommand({
		name: 'ping-test',
		description: 'Send a notification right now to check the setup',
		handler: sendTest,
	});

	let startedAt: number | undefined;

	api.on('run_start', () => {
		startedAt = now();
	});

	api.on('run_end', (event: RunEndEvent) => {
		if (startedAt === undefined) return;
		const elapsed = now() - startedAt;
		startedAt = undefined;

		const config = currentConfig();
		if (config === undefined || elapsed < config.thresholdMs) return;

		void publishRun(event.result ?? {}, elapsed, {config, fetchImpl, title, cwd: api.cwd}).then(
			outcome => {
				if (!outcome.published) {
					api.ui.notify(`Session-pinger: notification failed (${outcome.reason})`, 'warning');
				}
			},
		);
	});
}
