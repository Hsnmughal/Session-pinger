import test from 'node:test';
import assert from 'node:assert/strict';

import {parseThreshold, resolveConfig} from './config.ts';

test('no topic anywhere means notifications are off', () => {
	assert.equal(resolveConfig({}), undefined);
	assert.equal(resolveConfig({stored: {}}), undefined);
	assert.equal(resolveConfig({stored: {topic: '   '}}), undefined);
});

test('a stored topic gets the defaults', () => {
	assert.deepEqual(resolveConfig({stored: {topic: 'my-secret-topic'}}), {
		server: 'https://ntfy.sh',
		topic: 'my-secret-topic',
		thresholdMs: 60_000,
	});
});

test('a stored server, threshold and token are honored', () => {
	assert.deepEqual(
		resolveConfig({
			stored: {topic: 't', server: 'https://ntfy.example.com', thresholdMs: 5_000, token: 'tk'},
		}),
		{server: 'https://ntfy.example.com', topic: 't', thresholdMs: 5_000, token: 'tk'},
	);
});

test('env overrides the stored config', () => {
	assert.deepEqual(
		resolveConfig({
			stored: {topic: 'stored', server: 'https://ntfy.sh', thresholdMs: 60_000},
			env: {
				SESSION_PING_TOPIC: 'from-env',
				SESSION_PING_SERVER: 'https://env.example.com',
				SESSION_PING_THRESHOLD_MS: '15000',
			},
		}),
		{server: 'https://env.example.com', topic: 'from-env', thresholdMs: 15_000},
	);
});

test('env alone is enough, and bad values fall back', () => {
	assert.deepEqual(resolveConfig({env: {SESSION_PING_TOPIC: 'env-only'}}), {
		server: 'https://ntfy.sh',
		topic: 'env-only',
		thresholdMs: 60_000,
	});
	const badNumber = resolveConfig({
		stored: {topic: 't'},
		env: {SESSION_PING_THRESHOLD_MS: 'not-a-number'},
	});
	assert.equal(badNumber?.thresholdMs, 60_000);
	const negative = resolveConfig({stored: {topic: 't'}, env: {SESSION_PING_THRESHOLD_MS: '-5'}});
	assert.equal(negative?.thresholdMs, 60_000);
});

test('a stored threshold of zero falls back', () => {
	assert.equal(resolveConfig({stored: {topic: 't', thresholdMs: 0}})?.thresholdMs, 60_000);
});

test('topic whitespace is trimmed and a trailing slash in the server is dropped', () => {
	assert.deepEqual(resolveConfig({stored: {topic: '  padded  ', server: 'https://ntfy.sh/'}}), {
		server: 'https://ntfy.sh',
		topic: 'padded',
		thresholdMs: 60_000,
	});
});

test('threshold strings parse with units', () => {
	assert.equal(parseThreshold('30s'), 30_000);
	assert.equal(parseThreshold('45'), 45_000);
	assert.equal(parseThreshold('2m'), 120_000);
	assert.equal(parseThreshold('1h'), 3_600_000);
	assert.equal(parseThreshold('500ms'), 500);
	assert.equal(parseThreshold('nope'), undefined);
	assert.equal(parseThreshold('0'), undefined);
	assert.equal(parseThreshold('-5s'), undefined);
});
