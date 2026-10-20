import { describe, expect, test } from '@jest/globals';

import { changedPathsOf } from '../../src/boundary/changed-paths-of.js';

const textOf = (entries) => entries.map((entry) => `${entry}\0`).join('');

describe('the paths that one git status answer states', () => {
	test('answers the path of a modified, an untracked, a staged and a deleted file', () => {
		expect(changedPathsOf({ text: textOf([' M src/a.js', '?? src/b.js', 'A  src/c.js', ' D src/d.js']), prefix: '' }))
			.toEqual(['src/a.js', 'src/b.js', 'src/c.js', 'src/d.js']);
	});

	test('answers both paths of a rename, and reads the entry after it as a status again', () => {
		expect(changedPathsOf({ text: textOf(['R  src/new.js', 'README.md', ' M src/a.js']), prefix: '' }))
			.toEqual(['src/new.js', 'README.md', 'src/a.js']);
	});

	test('reads a path with a space and a newline as it is', () => {
		expect(changedPathsOf({ text: textOf(['?? src/a b\nc.js']), prefix: '' })).toEqual(['src/a b\nc.js']);
	});

	test('answers a path relative to the project, and a path outside it with a leading `../`', () => {
		expect(changedPathsOf({ text: textOf([' M workspace/src/a.js', ' M vm/Dockerfile']), prefix: 'workspace/' }))
			.toEqual(['src/a.js', '../vm/Dockerfile']);
	});
});
