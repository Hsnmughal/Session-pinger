export interface PingConfig {
	readonly server: string;
	readonly topic: string;
	readonly thresholdMs: number;
	readonly token?: string;
}

export interface StoredConfig {
	readonly topic?: unknown;
	readonly server?: unknown;
	readonly thresholdMs?: unknown;
	readonly token?: unknown;
}

export interface RunResult {
	readonly stopReason?: string;
	readonly finalText?: string;
}

export type FetchLike = (
	url: string,
	init: {readonly method: string; readonly headers: Record<string, string>; readonly body: string},
) => Promise<{readonly ok: boolean; readonly status: number}>;

export type PublishOutcome =
	| {readonly published: true}
	| {readonly published: false; readonly reason: string};

export interface Disposable {
	dispose(): void;
}

export interface ModCommandContext {
	readonly args: string;
}

export interface ModCommand {
	readonly name: string;
	readonly description: string;
	readonly argumentHint?: string;
	handler(context: ModCommandContext): unknown;
}

export interface RunStartEvent {
	readonly type: 'run_start';
	readonly sessionId?: string;
}

export interface RunEndEvent {
	readonly type: 'run_end';
	readonly result?: RunResult;
}

export interface ModEventMap {
	readonly run_start: RunStartEvent;
	readonly run_end: RunEndEvent;
}

export interface ModStore {
	get<T = unknown>(key: string): T | undefined;
	set(key: string, value: unknown): Promise<void>;
	delete(key: string): Promise<void>;
}

export interface ModUi {
	notify(message: string, level?: 'info' | 'warning' | 'error'): void;
}

export interface ModLike {
	readonly name: string;
	readonly cwd: string;
	readonly store: ModStore;
	readonly ui: ModUi;
	on<E extends keyof ModEventMap>(event: E, handler: (event: ModEventMap[E]) => void): Disposable;
	addCommand(command: ModCommand): Disposable;
}
