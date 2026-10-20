import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, test } from '@jest/globals';

const ENTRY = join(import.meta.dirname, '..', '..', 'bin', 'verify-boundary.js'),
	PROJECT = mkdtempSync(join(tmpdir(), 'verify-boundary-bin-')),
	GIT_CONFIG = ['-c', 'user.name=test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null'],
	gitOf = (given) => execFileSync('git', [...GIT_CONFIG, ...given], { cwd: PROJECT, stdio: 'ignore' }),
	runOf = (given) => spawnSync(process.execPath, [ENTRY, ...given], { cwd: PROJECT, encoding: 'utf8' });

mkdirSync(join(PROJECT, 'src'));
mkdirSync(join(PROJECT, 'plans'));
writeFileSync(join(PROJECT, 'src', 'a.js'), 'export const a = 1;\n');
gitOf(['init', '--quiet']);
gitOf(['add', '--all']);
gitOf(['commit', '--quiet', '-m', 'the tree before the run']);
writeFileSync(join(PROJECT, 'plans', 'a-plan.md'), [
	'## Implementation Plan',
	'',
	'#### Step 1.1: a step of the plan',
	'',
	'**Files to create**: `none`',
	'',
	'**Files to modify**: `src/a.js`',
	'',
	'**Files to delete**: `none`',
	''
].join('\n'));
writeFileSync(join(PROJECT, 'plans', 'a-plan.groups.json'), '[]\n');

afterAll(() => {
	rmSync(PROJECT, { recursive: true, force: true });
});

describe('node .claude/workflow/bin/verify-boundary.js, run as a process from the project root', () => {
	test('writes the answer to the output stream and exits zero for a change the plan names', () => {
		writeFileSync(join(PROJECT, 'src', 'a.js'), 'export const a = 2;\n');

		expect(runOf([])).toEqual(expect.objectContaining({
			status: 0,
			stdout: 'plans/a-plan.md: every change of the tree is inside the file lists of the plan\n',
			stderr: ''
		}));
	});

	test('writes the usage line to the error stream and exits one when it is given an argument', () => {
		const answer = runOf(['plans/a-plan.md']);

		expect(answer.status).toEqual(1);
		expect(answer.stdout).toEqual('');
		expect(answer.stderr).toContain('node .claude/workflow/bin/verify-boundary.js');
	});
});
