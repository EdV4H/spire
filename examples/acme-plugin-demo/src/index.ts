import {
	buildIndex,
	defineService,
	SPIRE_PLUGIN_API_VERSION,
	type SpirePlugin,
} from "@edv4h/spire-core";
import {
	type ConstraintRule,
	type ContentProvider,
	GEN_PLUGIN_ID,
	getGenRegistries,
} from "@edv4h/spire-gen";
import { z } from "zod";

/**
 * A plugin written the way a third party would write one.
 *
 * This package is deliberately outside the `@edv4h` scope and depends only on
 * the two published entry points — no deep imports, no internal types, no
 * patching. If Spire's extension surface is real, everything an application
 * needs is reachable from here; if a future change breaks this package, it
 * broke the public API.
 *
 * It contributes one of each kind of extension:
 *
 * - a node type with a data schema (`checkpoint`)
 * - a constraint rule (`acme:spacing`)
 * - a progression policy (`acme:sequential`)
 * - a content provider (`acme:onboarding-copy`)
 * - a service, so an application can reach its own API the same way
 */

export const ACME_PLUGIN_ID = "@acme/spire-onboarding";

export interface OnboardingApi {
	/** Copy the plugin would attach to a node of the given type. */
	copyFor(type: string, row: number): string;
}

export const onboardingService = defineService<OnboardingApi>("acme:onboarding");

const spacingParams = z.looseObject({
	type: z.string().min(1),
	/** Minimum number of rows between two nodes of this type. */
	gap: z.int().positive(),
});

/**
 * Keeps a type from clustering: no two nodes of `type` within `gap` rows.
 *
 * Expressible entirely through `assigned` and `positionOf`, which is the point
 * — a rule does not need access to the map document, only to what has been
 * decided so far.
 */
function spacingRule(): ConstraintRule {
	return {
		id: "acme:spacing",
		paramsSchema: spacingParams,
		evaluate(ctx) {
			const { type, gap } = ctx.params as { type: string; gap: number };
			if (ctx.candidateType !== type) return { allowed: true };

			for (const [nodeId, assigned] of ctx.assigned) {
				if (nodeId === ctx.nodeId || assigned !== type) continue;
				const other = ctx.positionOf(nodeId);
				if (other === undefined) continue;
				if (Math.abs(other.row - ctx.position.row) < gap) {
					return {
						allowed: false,
						reason: `"${type}" already sits ${Math.abs(other.row - ctx.position.row)} row(s) away on "${nodeId}"`,
					};
				}
			}
			return { allowed: true };
		},
	};
}

/**
 * Completion must follow the map top to bottom: a node opens only when every
 * node on every earlier row that leads to it is done.
 *
 * Stricter than the built-in `strict`, and a good illustration of why policies
 * are pluggable — "no skipping ahead" is a product decision, not a property of
 * the format.
 */
function sequentialPolicy() {
	return {
		id: "acme:sequential",
		canComplete: (ctx: {
			map: Parameters<typeof buildIndex>[0];
			state: { completed: Record<string, unknown> };
			nodeId: string;
		}): boolean => {
			const index = buildIndex(ctx.map);
			const node = index.nodesById.get(ctx.nodeId);
			if (node === undefined) return false;
			if (node.position.row === 0) return true;

			const predecessors = index.incoming.get(ctx.nodeId) ?? [];
			return (
				predecessors.length > 0 && predecessors.every((id) => ctx.state.completed[id] !== undefined)
			);
		},
	};
}

function onboardingCopy(api: OnboardingApi): ContentProvider {
	return {
		id: "acme:onboarding-copy",
		provide: async (slots) =>
			slots.map((slot) => ({
				nodeId: slot.nodeId,
				data: {
					title: api.copyFor(slot.type, slot.row),
					// An application's own vocabulary, opaque to the SDK.
					acmeStage: slot.row < 3 ? "intro" : "core",
				},
			})),
	};
}

export function createOnboardingPlugin(): SpirePlugin {
	return {
		id: ACME_PLUGIN_ID,
		name: "Acme onboarding",
		apiVersion: SPIRE_PLUGIN_API_VERSION,
		dependencies: [GEN_PLUGIN_ID],
		setup(ctx) {
			const gen = getGenRegistries(ctx.services);
			if (gen === undefined) {
				throw new Error(`${ACME_PLUGIN_ID} requires ${GEN_PLUGIN_ID}.`);
			}

			const api: OnboardingApi = {
				copyFor: (type, row) => `${type} step ${row + 1}`,
			};

			const offs = [
				ctx.nodeTypes.register({
					id: "checkpoint",
					dataSchema: z.looseObject({ title: z.string().min(1) }),
					meta: { label: "Checkpoint" },
				}),
				ctx.policies.register(sequentialPolicy()),
				gen.rules.register(spacingRule()),
				gen.contentProviders.register(onboardingCopy(api)),
				onboardingService.provide(ctx.services, api),
			];

			return () => {
				for (const off of offs.reverse()) off();
			};
		},
	};
}
