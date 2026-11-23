import test from 'node:test';
import assert from 'node:assert/strict';

import {formatDuration} from './duration.ts';

test('durations are readable', () => {
	assert.equal(formatDuration(0), '0s');
	assert.equal(formatDuration(5_000), '5s');
	assert.equal(formatDuration(65_000), '1m 05s');
	assert.equal(formatDuration(3_723_000), '1h 02m 03s');
});

test('sub-second durations round down to 0s', () => {
	assert.equal(formatDuration(999), '0s');
	assert.equal(formatDuration(1_500), '1s');
});
