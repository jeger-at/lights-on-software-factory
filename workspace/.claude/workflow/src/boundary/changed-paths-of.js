import { posix } from 'node:path';

const STATES_A_SECOND_PATH = /^[RC]/u,
	projectPathOf = ({ path, prefix }) =>
		path.startsWith(prefix) ? path.slice(prefix.length) : posix.relative(prefix, path);

/**
 * Every path that one `git status --porcelain=v1 -z` answer states, relative
 * to the project.
 *
 * Git states each path relative to the root of the repository. `prefix` is
 * what `git rev-parse --show-prefix` answers in the project directory, so a
 * path outside the project starts with `../`.
 *
 * A rename or a copy states its second path as an entry of its own, after the
 * first, and both are answered. The `-z` form quotes no path, so a path holds
 * any character.
 */
export const changedPathsOf = ({ text, prefix }) => {
	const paths = [];
	let secondPathNext = false;

	for (const entry of text.split('\0').filter((one) => one !== '')) {
		paths.push(projectPathOf({ path: secondPathNext ? entry : entry.slice(3), prefix }));
		secondPathNext = !secondPathNext && STATES_A_SECOND_PATH.test(entry);
	}
	return paths;
};
