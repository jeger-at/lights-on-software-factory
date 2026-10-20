import { posix } from 'node:path';

const LOCKFILES = ['package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml'],
	REFUSED = [
		{
			holds: (path) => path.startsWith('../'),
			fault: 'is outside the project, and no step of a run writes there'
		},
		{
			holds: (path) => LOCKFILES.includes(posix.basename(path)),
			fault: 'is a lockfile, and a lockfile changes only with an install, which no agent of a run does'
		},
		{
			holds: (path) => path.startsWith('.claude/'),
			fault: 'is under .claude/, which holds the run, and a run does not change what holds it'
		}
	],
	UNNAMED = 'is changed, and no step of the plan names it',
	faultOf = ({ path, allowed }) => {
		const refused = REFUSED.find((one) => one.holds(path));

		if (refused !== undefined) {
			return refused.fault;
		}
		return allowed.has(path) ? null : UNNAMED;
	};

/**
 * Every changed path that the plan does not allow, as the path and the fault,
 * in the order of the paths.
 *
 * `allowed` holds every file that a file list of a step names. The check reads
 * the tree and not the commands that changed it, so a file an agent wrote with
 * `Edit`, with `node -e`, with `sed -i` or with `tee` answers the same fault.
 *
 * A path outside the project, a lockfile and a file under `.claude/` are a
 * fault whatever a step states: every list is relative to the project, no
 * agent of a run installs a package, and a run does not change the
 * definitions, the regulator and the settings that hold it.
 */
export const boundaryFaultsOf = ({ paths, allowed }) => paths.flatMap((path) => {
	const fault = faultOf({ path, allowed });

	return fault === null ? [] : [{ path, fault }];
});
