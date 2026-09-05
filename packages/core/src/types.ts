import type { z } from "zod";
import type {
	completionRecordSchema,
	edgeSchema,
	gridSchema,
	mapDocumentSchema,
	nodeSchema,
	nodeTypeSchema,
	positionSchema,
	stateDocumentSchema,
} from "./schema.js";

export type NodeId = string;
export type EdgeId = string;
export type NodeTypeId = string;

export type Grid = z.infer<typeof gridSchema>;
export type Position = z.infer<typeof positionSchema>;
export type NodeType = z.infer<typeof nodeTypeSchema>;
export type SpireNode = z.infer<typeof nodeSchema>;
export type SpireEdge = z.infer<typeof edgeSchema>;
export type MapDocument = z.infer<typeof mapDocumentSchema>;
export type CompletionRecord = z.infer<typeof completionRecordSchema>;
export type StateDocument = z.infer<typeof stateDocumentSchema>;

/**
 * A node's topological status. All three are *derived* from the map plus the
 * completion set — only `completed` is ever stored (design doc §2.2).
 */
export type NodeStatus = "completed" | "reachable" | "locked";

export interface Progress {
	completedCount: number;
	total: number;
	/** `completedCount / total`, or 0 for an empty map. */
	ratio: number;
	reachableCount: number;
	/** Longest chain of completed nodes following edges, in node count. */
	longestCompletedPath: number;
	/** Whether at least one terminal-row node is completed. */
	reachedTerminal: boolean;
}
