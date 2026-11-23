import {formatDuration} from './duration.ts';
import type {FetchLike, PingConfig, PublishOutcome, RunResult} from './types.ts';

export interface PublishOptions {
	readonly config: PingConfig;
	readonly fetchImpl: FetchLike;
	readonly title: string;
	readonly cwd: string;
}

const STOP_REASON_LABELS: Readonly<Record<string, string>> = {
	end_turn: 'finished',
	max_turns: 'hit the turn limit',
	interrupted: 'interrupted',
	permission_denied: 'stopped on a permission prompt',
	stop_hook: 'stopped early',
	terminate: 'terminated',
};

const truncate = (text: string, max = 200): string => {
	const collapsed = text.replace(/\s+/g, ' ').trim();
	return collapsed.length <= max ? collapsed : `${collapsed.slice(0, max - 1)}…`;
};

export function buildMessage(result: RunResult, durationMs: number, cwd: string): string {
	const status = STOP_REASON_LABELS[result.stopReason ?? ''] ?? result.stopReason ?? 'finished';
	const lines = [`Run ${status} after ${formatDuration(durationMs)}.`];
	if (result.finalText !== undefined) {
		const tail = truncate(result.finalText);
		if (tail !== '') lines.push('', tail);
	}
	if (cwd !== '') lines.push('', `cwd: ${cwd}`);
	return lines.join('\n');
}

export async function publishRun(
	result: RunResult,
	durationMs: number,
	{config, fetchImpl, title, cwd}: PublishOptions,
): Promise<PublishOutcome> {
	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
		'X-Title': title,
		Tags: 'white_check_mark',
	};
	if (config.token !== undefined) headers.Authorization = `Bearer ${config.token}`;

	let response: {ok: boolean; status: number};
	try {
		response = await fetchImpl(`${config.server}/${encodeURIComponent(config.topic)}`, {
			method: 'POST',
			headers,
			body: JSON.stringify({
				topic: config.topic,
				title,
				message: buildMessage(result, durationMs, cwd),
			}),
		});
	} catch {
		return {published: false, reason: 'error'};
	}

	return response.ok ? {published: true} : {published: false, reason: `http-${response.status}`};
}

export const httpFetch: FetchLike = async (url, init) => {
	const response = await globalThis.fetch(url, init);
	return {ok: response.ok, status: response.status};
};
