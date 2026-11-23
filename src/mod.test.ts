import test from 'node:test';
import assert from 'node:assert/strict';

import {createSessionPing} from './mod.ts';
import type {FetchLike, ModCommand, ModEventMap, ModLike} from './types.ts';

interface FakeModOptions {
	readonly stored?: Record<string, unknown>;
	readonly env?: Record<string, string>;
	readonly fetchImpl?: FetchLike;
}

function fakeMod(options: FakeModOptions = {}) {
	const handlers = new Map<string, Array<(event: unknown) => void>>();
	const commands = new Map<string, ModCommand>();
	const stored: Record<string, unknown> = {...options.stored};
	const notices: string[] = [];
	const sent: Array<{url: string; body: string}> = [];
	let clock = 1_000;

	const api: ModLike = {
		name: 'Session-pinger',
		cwd: '/repo',
		store: {
			get: <T = unknown>(key: string): T | undefined => stored[key] as T | undefined,
			set: async (key, value) => {
				stored[key] = value;
			},
			delete: async key => {
				delete stored[key];
			},
		},
		ui: {notify: (message, level) => void notices.push(`${level ?? 'info'}:${message}`)},
		on: (event, handler) => {
			handlers.set(event, [...(handlers.get(event) ?? []), handler as (e: unknown) => void]);
			return {dispose: () => {}};
		},
		addCommand: command => {
			commands.set(command.name, command);
			return {dispose: () => {}};
		},
	};

	const fetchImpl: FetchLike = async (url, init) => {
		sent.push({url, body: init.body});
		return {ok: true, status: 200};
	};

	createSessionPing(api, {
		env: options.env ?? {},
		now: () => clock,
		fetchImpl: options.fetchImpl ?? fetchImpl,
	});

	const emit = <E extends keyof ModEventMap>(event: E, payload: ModEventMap[E]) => {
		for (const handler of handlers.get(event) ?? []) handler(payload);
	};
	const run = (name: string, args = '') =>
		commands.get(name)?.handler({args}) as {message: string};
	const runAsync = (name: string, args = '') =>
		commands.get(name)?.handler({args}) as Promise<{message: string}>;

	return {
		stored,
		notices,
		sent,
		commands,
		run,
		runAsync,
		emit,
		advance: (ms: number) => {
			clock += ms;
		},
	};
}

const settle = () => new Promise(resolve => setImmediate(resolve));

test('registers the three ping commands', () => {
	const h = fakeMod();
	assert.deepEqual([...h.commands.keys()].sort(), ['ping', 'ping-setup', 'ping-test']);
});

test('a long run pings exactly once', async () => {
	const h = fakeMod({stored: {config: {topic: 'phone-topic'}}});

	h.emit('run_start', {type: 'run_start', sessionId: 's'});
	h.advance(120_000);
	h.emit('run_end', {type: 'run_end', result: {stopReason: 'end_turn', finalText: 'All done.'}});
	await settle();

	assert.equal(h.sent.length, 1);
	assert.equal(h.sent[0]?.url, 'https://ntfy.sh/phone-topic');
	assert.equal(h.notices.length, 0);

	h.emit('run_end', {type: 'run_end', result: {stopReason: 'end_turn'}});
	await settle();
	assert.equal(h.sent.length, 1, 'a second run_end without a run_start must not re-ping');
});

test('a short run stays silent', async () => {
	const h = fakeMod({stored: {config: {topic: 'phone-topic'}}});

	h.emit('run_start', {type: 'run_start'});
	h.advance(3_000);
	h.emit('run_end', {type: 'run_end', result: {stopReason: 'end_turn'}});
	await settle();

	assert.equal(h.sent.length, 0);
	assert.equal(h.notices.length, 0);
});

test('a run end without a start sends nothing', async () => {
	const h = fakeMod({stored: {config: {topic: 'phone-topic'}}});
	h.emit('run_end', {type: 'run_end', result: {stopReason: 'end_turn'}});
	await settle();
	assert.equal(h.sent.length, 0);
});

test('with no topic configured, runs send nothing and say nothing', async () => {
	const h = fakeMod();

	h.emit('run_start', {type: 'run_start'});
	h.advance(120_000);
	h.emit('run_end', {type: 'run_end', result: {stopReason: 'end_turn'}});
	await settle();

	assert.equal(h.sent.length, 0);
	assert.equal(h.notices.length, 0);
});

test('/ping-setup saves the topic, then a run pings without a reload', async () => {
	const h = fakeMod();

	const result = h.run('ping-setup', 'topic=my-topic threshold=30s');
	assert.match(result.message, /my-topic/);
	assert.equal((h.stored.config as {topic: string}).topic, 'my-topic');
	assert.equal((h.stored.config as {thresholdMs: number}).thresholdMs, 30_000);

	h.emit('run_start', {type: 'run_start'});
	h.advance(45_000);
	h.emit('run_end', {type: 'run_end', result: {stopReason: 'end_turn'}});
	await settle();
	assert.equal(h.sent.length, 1);
});

test('/ping-setup keeps earlier values when only one key is set', () => {
	const h = fakeMod({stored: {config: {topic: 'old', thresholdMs: 5_000}}});
	h.run('ping-setup', 'server=https://ntfy.example.com');
	const config = h.stored.config as {topic: string; server: string; thresholdMs: number};
	assert.equal(config.topic, 'old');
	assert.equal(config.thresholdMs, 5_000);
	assert.equal(config.server, 'https://ntfy.example.com');
});

test('/ping-setup ignores unknown keys and a bad threshold', () => {
	const h = fakeMod();
	h.run('ping-setup', 'topic=t bogus=1 threshold=banana');
	const config = h.stored.config as {topic: string; thresholdMs?: number; bogus?: unknown};
	assert.equal(config.topic, 't');
	assert.equal(config.thresholdMs, undefined);
	assert.equal(config.bogus, undefined);
});

test('/ping-setup with no topic saves nothing', () => {
	const h = fakeMod();
	assert.match(h.run('ping-setup', 'threshold=30s').message, /topic is required/i);
	assert.equal(h.stored.config, undefined);
});

test('/ping-setup with no arguments prints usage and saves nothing', () => {
	const h = fakeMod();
	assert.match(h.run('ping-setup').message, /usage/i);
	assert.equal(h.stored.config, undefined);
});

test('/ping-setup off clears the config', () => {
	const h = fakeMod({stored: {config: {topic: 'old'}}});
	assert.match(h.run('ping-setup', 'off').message, /off/i);
	assert.equal(h.stored.config, undefined);
});

test('/ping-test sends immediately and reports the outcome', async () => {
	const h = fakeMod({stored: {config: {topic: 'phone-topic'}}});
	const result = await h.runAsync('ping-test');
	assert.equal(h.sent.length, 1);
	assert.match(result.message, /sent/i);
});

test('/ping-test without a topic explains the setup instead of failing', async () => {
	const h = fakeMod();
	const result = await h.runAsync('ping-test');
	assert.equal(h.sent.length, 0);
	assert.match(result.message, /ping-setup/);
});

test('/ping reports the current config', () => {
	const h = fakeMod({stored: {config: {topic: 't', thresholdMs: 90_000}}});
	const result = h.run('ping');
	assert.match(result.message, /t/);
	assert.match(result.message, /1m 30s/);
});

test('/ping reports off when nothing is configured', () => {
	const h = fakeMod();
	assert.match(h.run('ping').message, /off/i);
});

test('env config pings without touching the store', async () => {
	const h = fakeMod({env: {SESSION_PING_TOPIC: 'env-topic'}});

	h.emit('run_start', {type: 'run_start'});
	h.advance(90_000);
	h.emit('run_end', {type: 'run_end', result: {stopReason: 'end_turn'}});
	await settle();

	assert.equal(h.sent[0]?.url, 'https://ntfy.sh/env-topic');
	assert.equal(h.stored.config, undefined);
});

test('a failed delivery reports one warning in the local feed', async () => {
	const h = fakeMod({
		stored: {config: {topic: 't'}},
		fetchImpl: async () => {
			throw new Error('offline');
		},
	});

	h.emit('run_start', {type: 'run_start'});
	h.advance(120_000);
	h.emit('run_end', {type: 'run_end', result: {stopReason: 'end_turn'}});
	await settle();

	assert.equal(h.notices.length, 1);
	assert.match(h.notices[0] ?? '', /notification failed \(error\)/);
});
