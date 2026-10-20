import { describe, expect, test } from '@jest/globals';

import { boundaryFaultsOf } from '../../src/boundary/boundary-faults-of.js';

const ALLOWED = new Set(['src/a.js', 'package-lock.json', '.claude/settings.local.json']),
	faultsOf = (paths) => boundaryFaultsOf({ paths, allowed: ALLOWED });

describe('the faults of the changed paths against the files of the plan', () => {
	test('answers no fault for a path that a step names', () => {
		expect(faultsOf(['src/a.js'])).toEqual([]);
	});

	test('names a path that no step names, in the order of the paths', () => {
		expect(faultsOf(['notes.txt', 'src/a.js', 'src/b.js'])).toEqual([
			{ path: 'notes.txt', fault: 'is changed, and no step of the plan names it' },
			{ path: 'src/b.js', fault: 'is changed, and no step of the plan names it' }
		]);
	});

	test('names a path outside the project', () => {
		expect(faultsOf(['../vm/Dockerfile'])).toEqual([
			{ path: '../vm/Dockerfile', fault: 'is outside the project, and no step of a run writes there' }
		]);
	});

	test('names a lockfile at any depth, even where a step names it', () => {
		expect(faultsOf(['package-lock.json', 'packages/a/yarn.lock'])).toEqual([
			{ path: 'package-lock.json', fault: 'is a lockfile, and a lockfile changes only with an install, which no agent of a run does' },
			{ path: 'packages/a/yarn.lock', fault: 'is a lockfile, and a lockfile changes only with an install, which no agent of a run does' }
		]);
	});

	test('names a file under .claude/, even where a step names it', () => {
		expect(faultsOf(['.claude/settings.local.json'])).toEqual([
			{ path: '.claude/settings.local.json', fault: 'is under .claude/, which holds the run, and a run does not change what holds it' }
		]);
	});

	test('answers no fault for a file whose name only ends like a lockfile', () => {
		expect(boundaryFaultsOf({ paths: ['src/not-a-package-lock.json'], allowed: new Set(['src/not-a-package-lock.json']) })).toEqual([]);
	});
});
