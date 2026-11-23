import test from 'node:test';
import assert from 'node:assert/strict';

import {buildMessage, publishRun} from './deliver.ts';
import type {FetchLike, PingConfig} from './types.ts';

const config: PingConfig = {server: 'https://ntfy.sh', topic: 'secret-topic', thresholdMs: 60_000};

function recordingFetch(responses: Array<{ok: boolean; status: number} | Error> = []) {
	const calls: Array<{url: string; init: {method: string; headers: Record<string, string>; body: string}}> = [];
	const fetchImpl: FetchLike = async (url, init) => {
		calls.push({url, init});
		const next = responses.shift();
		if (next instanceof Error) throw next;
		return next ?? {ok: true, status: 200};
	};
	return {calls, fetchImpl};
}

const baseOptions = () => ({
	config,
	title: 'Command Code run finished',
	cwd: '/repo',
});

test('a successful publish POSTs the message as JSON to the topic URL', async () => {
	const {calls, fetchImpl} = recordingFetch();
	const outcome = await publishRun({stopReason: 'end_turn', finalText: 'All green.'}, 95_000, {
		...baseOptions(),
		fetchImpl,
	});

	assert.deepEqual(outcome, {published: true});
	assert.equal(calls.length, 1);
	const [call] = calls;
	assert.equal(call?.url, 'https://ntfy.sh/secret-topic');
	assert.equal(call?.init.method, 'POST');
	assert.equal(call?.init.headers['Content-Type'], 'application/json');

	const body = JSON.parse(call?.init.body ?? '');
	assert.equal(body.topic, 'secret-topic');
	assert.equal(body.title, 'Command Code run finished');
	assert.equal(body.message, 'Run finished after 1m 35s.\n\nAll green.\n\ncwd: /repo');
});

test('a token is sent as a bearer header', async () => {
	const {calls, fetchImpl} = recordingFetch();
	await publishRun({}, 0, {...baseOptions(), config: {...config, token: 'secret-token'}, fetchImpl});
	assert.equal(calls[0]?.init.headers.Authorization, 'Bearer secret-token');
});

test('no token means no Authorization header', async () => {
	const {calls, fetchImpl} = recordingFetch();
	await publishRun({}, 0, {...baseOptions(), fetchImpl});
	assert.equal(calls[0]?.init.headers.Authorization, undefined);
});

test('a transport failure reports instead of throwing', async () => {
	const {fetchImpl} = recordingFetch([new Error('offline')]);
	const outcome = await publishRun({}, 0, {...baseOptions(), fetchImpl});
	assert.deepEqual(outcome, {published: false, reason: 'error'});
});

test('a non-2xx response reports the status', async () => {
	const {fetchImpl} = recordingFetch([{ok: false, status: 404}]);
	const outcome = await publishRun({}, 0, {...baseOptions(), fetchImpl});
	assert.deepEqual(outcome, {published: false, reason: 'http-404'});
});

test('the topic is URL-encoded', async () => {
	const {calls, fetchImpl} = recordingFetch();
	await publishRun({}, 0, {...baseOptions(), config: {...config, topic: 'a b/c'}, fetchImpl});
	assert.equal(calls[0]?.url, 'https://ntfy.sh/a%20b%2Fc');
});

test('the message carries duration, status and cwd', () => {
	assert.equal(
		buildMessage({stopReason: 'interrupted'}, 125_000, '/repo'),
		'Run interrupted after 2m 05s.\n\ncwd: /repo',
	);
});

test('an unknown stop reason passes through, and an absent one reads as finished', () => {
	assert.equal(
		buildMessage({stopReason: 'context_overflow'}, 60_000, ''),
		'Run context_overflow after 1m 00s.',
	);
	assert.equal(buildMessage({}, 60_000, ''), 'Run finished after 1m 00s.');
});

test('long final text is truncated so the notification stays readable', () => {
	const message = buildMessage({stopReason: 'end_turn', finalText: 'x'.repeat(400)}, 60_000, '');
	const tail = message.split('\n\n')[1] ?? '';
	assert.equal(tail.length, 200);
	assert.ok(tail.endsWith('…'));
});

test('whitespace in final text is collapsed to one line', () => {
	const message = buildMessage({stopReason: 'end_turn', finalText: '  a\n\n   b\t c  '}, 0, '');
	assert.equal(message, 'Run finished after 0s.\n\na b c');
});
