import {
	buildIndex,
	type MapDocument,
	type NodeId,
	type NodeTypeId,
	type Registry,
	type ValidationError,
	validationError,
} from "@edv4h/spire-core";
import type { ConstraintRule, RuleContext } from "./registries.js";
import type { Constraint } from "./spec.js";

/**
 * Re-check a finished map against a GenSpec's constraints.
 *
 * This is the other half of "one rule implementation": the generator uses
 * `evaluate` to filter candidates, and this uses the same `evaluate` to audit
 * an existing map — one a host edited by hand, or one loaded from storage after
 * the spec changed. A rule cannot drift between the two paths because there is
 * only one of it.
 */
export function validateConstraints(
	map: MapDocument,
	constraints: readonly Constraint[],
	rules: Registry<ConstraintRule>,
): ValidationError[] {
	const errors: ValidationError[] = [];
	const index = buildIndex(map);

	const assigned = new Map<NodeId, NodeTypeId>();
	for (const node of map.nodes) assigned.set(node.id, node.type);

	const siblingsOf = (nodeId: NodeId): NodeId[] => {
		const group = new Set<NodeId>();
		for (const parent of index.incoming.get(nodeId) ?? []) {
			for (const child of index.outgoing.get(parent) ?? []) {
				if (child !== nodeId) group.add(child);
			}
		}
		return [...group];
	};

	for (const constraint of constraints) {
		const rule = rules.get(constraint.rule);
		if (rule === undefined) {
			errors.push(
				validationError(
					"unknown_rule",
					["constraints"],
					`Constraint rule "${constraint.rule}" is not registered.`,
					{ rule: constraint.rule, available: rules.ids() },
				),
			);
			continue;
		}

		const { rule: _id, ...rawParams } = constraint as Record<string, unknown> & { rule: string };
		let params: Record<string, unknown> = rawParams;
		if (rule.paramsSchema !== undefined) {
			const parsed = rule.paramsSchema.safeParse(rawParams);
			if (!parsed.success) {
				errors.push(
					validationError(
						"invalid_rule_params",
						["constraints"],
						`Constraint "${constraint.rule}": ${parsed.error.issues.map((i) => i.message).join("; ")}`,
						{ rule: constraint.rule },
					),
				);
				continue;
			}
			params = parsed.data as Record<string, unknown>;
		}

		map.nodes.forEach((node, i) => {
			const ctx: RuleContext = {
				nodeId: node.id,
				candidateType: node.type,
				position: node.position,
				terminalRow: index.terminalRow,
				assigned,
				predecessors: index.incoming.get(node.id) ?? [],
				successors: index.outgoing.get(node.id) ?? [],
				siblings: siblingsOf(node.id),
				positionOf: (id) => index.nodesById.get(id)?.position,
				params,
			};

			const verdict = rule.evaluate(ctx);
			if (!verdict.allowed) {
				errors.push(
					validationError(
						"constraint_violation",
						["nodes", i, "type"],
						`Node "${node.id}" violates constraint "${rule.id}"${
							verdict.reason === undefined ? "" : `: ${verdict.reason}`
						}.`,
						{ rule: rule.id, nodeId: node.id, type: node.type },
					),
				);
			}
		});
	}

	return errors;
}
