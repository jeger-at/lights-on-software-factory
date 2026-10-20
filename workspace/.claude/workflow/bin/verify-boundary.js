import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { boundaryFaultsOf } from '../src/boundary/boundary-faults-of.js';
import { changedPathsOf } from '../src/boundary/changed-paths-of.js';
import { readPlanSteps } from '../src/generator/read-plan-steps.js';
import { readStepFiles } from '../src/generator/read-step-files.js';
import { streamsOf } from '../src/generator/streams-of.js';

const USAGE = 'verify-boundary: takes no argument, and checks the tree against every plan with a generated run, for example: node .claude/workflow/bin/verify-boundary.js',
	PLANS = 'plans',
	GROUPS_SUFFIX = '.groups.json',
	OWN_SUFFIXES = ['.md', '.plan.json', '.progress.jsonl', GROUPS_SUFFIX, '.workflow.mjs'],
	messageOf = (thrown) => thrown instanceof Error ? thrown.message : String(thrown),
	generatedPlansOf = (root) => (existsSync(join(root, PLANS)) ? readdirSync(join(root, PLANS)) : [])
		.filter((name) => name.endsWith(GROUPS_SUFFIX))
		.map((name) => `${PLANS}/${name.slice(0, -GROUPS_SUFFIX.length)}`)
		.filter((base) => existsSync(join(root, `${base}.md`)))
		.toSorted(),
	filesOfPlan = ({ root, base }) => [
		...OWN_SUFFIXES.map((suffix) => `${base}${suffix}`),
		...readPlanSteps(readFileSync(join(root, `${base}.md`), 'utf8')).flatMap((one) => readStepFiles(one.body).files ?? [])
	],
	gitOf = ({ root, given }) => execFileSync('git', given, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }),
	changedPathsIn = (root) => {
		try {
			gitOf({ root, given: ['rev-parse', '--verify', '--quiet', 'HEAD'] });
		} catch (thrown) {
			throw new Error('git reads no commit to compare the tree with, so the boundary cannot be proved; commit the tree before a run starts', { cause: thrown });
		}
		return changedPathsOf({
			text: gitOf({ root, given: ['status', '--porcelain=v1', '-z', '--untracked-files=all'] }),
			prefix: gitOf({ root, given: ['rev-parse', '--show-prefix'] }).trim()
		});
	},
	verifiedOf = ({ root, bases }) => {
		const named = bases.map((base) => `${base}.md`).join(', '),
			allowed = new Set(bases.flatMap((base) => filesOfPlan({ root, base }))),
			faults = boundaryFaultsOf({ paths: changedPathsIn(root), allowed });

		return faults.length === 0
			? { out: `${named}: every change of the tree is inside the file lists of the plan`, error: '', status: 0 }
			: { out: '', error: faults.map(({ path, fault }) => `${named}: ${path} ${fault}`).join('\n'), status: 1 };
	},
	answerOf = (given, root = process.cwd()) => {
		if (given.length > 0) {
			return { out: '', error: USAGE, status: 1 };
		}
		try {
			const bases = generatedPlansOf(root);

			return bases.length === 0
				? { out: `verify-boundary: no plan under ${PLANS}/ has a generated run, so there is no boundary to check`, error: '', status: 0 }
				: verifiedOf({ root, bases });
		} catch (thrown) {
			return { out: '', error: messageOf(thrown), status: 1 };
		}
	};

const main = () => {
	const { stdout, stderr, status } = streamsOf(answerOf(process.argv.slice(2)));

	process.stdout.write(stdout);
	process.stderr.write(stderr);
	process.exit(status);
};

if (import.meta.url === `file://${process.argv[1]}`) {
	main();
}

export { answerOf };
