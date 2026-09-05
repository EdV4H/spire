import { buildIndex } from "../graph/index-map.js";
import type { PolicyContext, ProgressionPolicyDefinition } from "../plugin/plugin.js";

/**
 * The progression policies the kernel registers on its own.
 *
 * They are ordered strictest first, because that is the order a host presents
 * them in and the order in which a reader should meet them.
 *
 * Everything else — quorum rules, time windows, role checks — arrives as a
 * plugin and is selected by id, so a host's configuration JSON can name a
 * policy without shipping code for it.
 */

export const SINGLE_ROUTE = "single-route";
export const STRICT = "strict";
export const FREE = "free";

/**
 * One route through the map, which is the default.
 *
 * A branch is only a choice if taking one arm costs you the other. Under
 * `strict` a player can walk *every* arm of *every* branch and reach the summit
 * having seen the whole map, which makes the branching decorative — so the
 * default is the rule that gives it meaning: the completed set must stay a
 * single unbroken path.
 *
 * That is three refusals:
 *
 * - a node that is not reachable (the `strict` rule, still in force)
 * - a second entry point, once a route has been started
 * - stepping off a node that has already been stepped off — the branch itself
 *
 * The third case is the interesting one, and it is also why a forked completed
 * set (which `mergeStates` can produce by merging two players' progress) cannot
 * be extended under this policy: there is no longer one route to extend.
 */
function completesOneRoute(ctx: PolicyContext): boolean {
	if (ctx.status !== "reachable") return false;

	// Nothing walked yet: every entry point is still available to be *the* one.
	if (Object.keys(ctx.state.completed).length === 0) return true;

	const index = buildIndex(ctx.map);
	const predecessors = (index.incoming.get(ctx.nodeId) ?? []).filter(
		(id) => ctx.state.completed[id] !== undefined,
	);

	// None means a second entry point; more than one means this node would join
	// two separate routes into a fork. Neither is a single route.
	if (predecessors.length !== 1) return false;
	const from = predecessors[0] as string;

	return (index.outgoing.get(from) ?? []).every((next) => ctx.state.completed[next] === undefined);
}

export const BUILTIN_POLICIES: readonly ProgressionPolicyDefinition[] = [
	{
		id: SINGLE_ROUTE,
		canComplete: completesOneRoute,
	},
	{
		// Reachable only, but every branch may be walked. This is what a map
		// wants when its nodes are things to collect rather than a way to go.
		id: STRICT,
		canComplete: (ctx) => ctx.status === "reachable",
	},
	{
		id: FREE,
		canComplete: () => true,
	},
];
