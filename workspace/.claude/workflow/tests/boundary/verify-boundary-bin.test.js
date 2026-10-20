import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterAll, describe, expect, test } from '@jest/globals';

import { answerOf } from '../../bin/verify-boundary.js';
import { streamsOf } from '../../src/generator/streams-of.js';

const DIRECTORY = mkdtempSync(join(tmpdir(), 'verify-boundary-bin-')),
	PLAN = 'plans/a-plan.md',
	GIT_CONFIG = ['-c', 'user.name=test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null'],
	PLAN_TEXT = [
		'## Implementation Plan',
		'',
		'#### Step 1.1: a step of the plan',
		'',
		'**Files to create**: `src/new.js`',
		'',
		'**Files to modify**: `src/old.js`',
		'',
		'**Files to delete**: `src/gone.js`',
		''
	].join('\n'),
	TRACKED = {
		'src/old.js': 'export const old = 1;\n',
		'src/gone.js': 'export const gone = 1;\n',
		'src/other.js': 'export const other = 1;\n',
		'package-lock.json': '{}\n',
		'.claude/agents/workflow-worker.md': 'a definition\n'
	};
let repositories = 0;

const gitIn = ({ cwd, given }) => execFileSync('git', [...GIT_CONFIG, ...given], { cwd, stdio: 'ignore' }),
	writeIn = ({ project, path, text }) => {
		mkdirSync(dirname(join(project, path)), { recursive: true });
		writeFileSync(join(project, path), text);
	},
	projectOf = ({ committed = true, generated = true } = {}) => {
		repositories += 1;
		const root = join(DIRECTORY, `repository-${repositories}`),
			project = join(root, 'workspace');

		Object.entries(TRACKED).forEach(([path, text]) => writeIn({ project, path, text }));
		writeIn({ project: root, path: 'README.md', text: 'a readme\n' });
		gitIn({ cwd: root, given: ['init', '--quiet'] });
		if (committed) {
			gitIn({ cwd: root, given: ['add', '--all'] });
			gitIn({ cwd: root, given: ['commit', '--quiet', '-m', 'the tree before the run'] });
		}
		writeIn({ project, path: PLAN, text: PLAN_TEXT });
		if (generated) {
			writeIn({ project, path: 'plans/a-plan.groups.json', text: '[]\n' });
		}
		return project;
	},
	runOf = ({ project, given = [] }) => streamsOf(answerOf(given, project));

afterAll(() => {
	rmSync(DIRECTORY, { recursive: true, force: true });
});

describe('bin/verify-boundary.js, given a project with a generated run', () => {
	describe('a tree whose changes the plan names', () => {
		test('exits zero', () => {
			const project = projectOf();

			writeIn({ project, path: 'src/old.js', text: 'export const old = 2;\n' });

			expect(runOf({ project }).status).toEqual(0);
		});

		test('states the plan and that every change is inside its file lists, and writes nothing to the error stream', () => {
			const project = projectOf();

			writeIn({ project, path: 'src/old.js', text: 'export const old = 2;\n' });

			expect(runOf({ project })).toEqual({
				stdout: `${PLAN}: every change of the tree is inside the file lists of the plan\n`,
				stderr: '',
				status: 0
			});
		});

		test('allows a git mv from a file the plan deletes to a file the plan creates', () => {
			const project = projectOf();

			gitIn({ cwd: project, given: ['mv', 'src/gone.js', 'src/new.js'] });

			expect(runOf({ project }).status).toEqual(0);
		});

		test('allows the files of the plan itself, which the person and the progress poll write', () => {
			const project = projectOf();

			writeIn({ project, path: 'plans/a-plan.progress.jsonl', text: '{}\n' });

			expect(runOf({ project }).status).toEqual(0);
		});
	});

	describe('a tree that holds a change the plan does not name', () => {
		test('exits non-zero', () => {
			const project = projectOf();

			writeIn({ project, path: 'notes.txt', text: 'a scratch note\n' });

			expect(runOf({ project }).status).toEqual(1);
		});

		test('names the plan and the file on one line of the error stream, whatever tool wrote it', () => {
			const project = projectOf();

			execFileSync(process.execPath, ['-e', 'require("node:fs").writeFileSync("src/other.js", "export const other = 2;\\n")'], { cwd: project });

			expect(runOf({ project }).stderr).toEqual(`${PLAN}: src/other.js is changed, and no step of the plan names it\n`);
		});

		test('writes nothing to the output stream', () => {
			const project = projectOf();

			writeIn({ project, path: 'notes.txt', text: 'a scratch note\n' });

			expect(runOf({ project }).stdout).toEqual('');
		});
	});

	describe('a tree that holds a change a step can never name', () => {
		test('names a change of the lockfile', () => {
			const project = projectOf();

			writeIn({ project, path: 'package-lock.json', text: '{ "lockfileVersion": 3 }\n' });

			expect(runOf({ project }).stderr).toEqual(
				`${PLAN}: package-lock.json is a lockfile, and a lockfile changes only with an install, which no agent of a run does\n`
			);
		});

		test('names a change under .claude/', () => {
			const project = projectOf();

			writeIn({ project, path: '.claude/agents/workflow-worker.md', text: 'a wider definition\n' });

			expect(runOf({ project }).stderr).toEqual(
				`${PLAN}: .claude/agents/workflow-worker.md is under .claude/, which holds the run, and a run does not change what holds it\n`
			);
		});

		test('names a change outside the project, in the repository that holds it', () => {
			const project = projectOf();

			writeIn({ project: join(project, '..'), path: 'README.md', text: 'changed\n' });

			expect(runOf({ project }).stderr).toEqual(`${PLAN}: ../README.md is outside the project, and no step of a run writes there\n`);
		});
	});

	describe('a tree with no commit', () => {
		test('exits non-zero', () => {
			expect(runOf({ project: projectOf({ committed: false }) }).status).toEqual(1);
		});

		test('says that nothing states what the run changed, as text and no stack trace', () => {
			const answer = runOf({ project: projectOf({ committed: false }) });

			expect(answer.stderr).toContain('git reads no commit to compare the tree with');
			expect(answer.stderr).not.toContain('at ');
		});
	});
});

describe('bin/verify-boundary.js, given a project with no generated run', () => {
	test('exits zero and says there is no boundary to check', () => {
		expect(runOf({ project: projectOf({ generated: false }) })).toEqual({
			stdout: 'verify-boundary: no plan under plans/ has a generated run, so there is no boundary to check\n',
			stderr: '',
			status: 0
		});
	});
});

describe('bin/verify-boundary.js, given an argument', () => {
	test('exits non-zero', () => {
		expect(runOf({ project: DIRECTORY, given: [PLAN] }).status).toEqual(1);
	});

	test('says that it takes no argument, and names the entry as the example', () => {
		expect(runOf({ project: DIRECTORY, given: [PLAN] }).stderr).toContain('takes no argument');
		expect(runOf({ project: DIRECTORY, given: [PLAN] }).stderr).toContain('node .claude/workflow/bin/verify-boundary.js');
	});
});
