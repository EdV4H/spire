// Result

export type { EditResult } from "./graph/edit.js";
export {
	addEdge,
	addNode,
	moveNode,
	removeEdge,
	removeNode,
	setNodeType,
	updateNodeData,
} from "./graph/edit.js";
// Graph
export type { MapIndex } from "./graph/index-map.js";
export { buildIndex, cellKey } from "./graph/index-map.js";
export type { PathsOptions, PathsResult } from "./graph/paths.js";
export { paths } from "./graph/paths.js";
export type { IdGen } from "./ids.js";
export { createIdGen, mapIdFromSeed } from "./ids.js";
// Migration
export type { MigrationError } from "./migrate.js";
export { documentVersion, migrate } from "./migrate.js";
// Plugin system
export type { CreateSpireOptions, Spire } from "./plugin/create-spire.js";
export { BUILTIN_POLICIES, createSpire } from "./plugin/create-spire.js";
export type { PluginError, PluginErrorCode } from "./plugin/errors.js";
export { pluginError } from "./plugin/errors.js";
export type { EventBus, EventHandlerError, Unsubscribe } from "./plugin/event-bus.js";
export { CORE_EVENTS, createEventBus } from "./plugin/event-bus.js";
export type {
	MapValidator,
	Migration,
	NodeTypeDefinition,
	PluginContext,
	PluginInfoRegistry,
	PluginTeardown,
	PolicyContext,
	ProgressionPolicyDefinition,
	SpirePlugin,
	ValidateContext,
} from "./plugin/plugin.js";
export { SPIRE_PLUGIN_API_VERSION } from "./plugin/plugin.js";
export type {
	Attribution,
	HasId,
	InternalRegistry,
	RegisterOptions,
	Registry,
	Unregister,
} from "./plugin/registry.js";
export { createRegistry } from "./plugin/registry.js";
export type { ServiceHandle, ServiceRegistry, Unprovide } from "./plugin/service.js";
export { createServiceRegistry, defineService } from "./plugin/service.js";
export { mergeStates } from "./progress/merge.js";
// Progression
export { getNodeStatus, getProgress, getReachableNodes } from "./progress/status.js";
export type { CompleteOptions, RuleViolation } from "./progress/transitions.js";
export { complete, uncomplete } from "./progress/transitions.js";
export type { Err, Ok, Result } from "./result.js";
export { collect, err, isErr, isOk, mapErr, mapResult, ok, unwrapOr } from "./result.js";
// Determinism
export type { Rng } from "./rng.js";
export { createRng } from "./rng.js";
// Spire Map Format
export {
	completionRecordSchema,
	edgeIdSchema,
	edgeSchema,
	gridSchema,
	mapDocumentSchema,
	nodeIdSchema,
	nodeSchema,
	nodeTypeIdSchema,
	nodeTypeSchema,
	positionSchema,
	SMF_VERSION,
	stateDocumentSchema,
} from "./schema.js";
export type {
	CompletionRecord,
	EdgeId,
	Grid,
	MapDocument,
	NodeId,
	NodeStatus,
	NodeType,
	NodeTypeId,
	Position,
	Progress,
	SpireEdge,
	SpireNode,
	StateDocument,
} from "./types.js";
// Validation
export type { ValidationError, ValidationErrorCode } from "./validate/errors.js";
export { validationError } from "./validate/errors.js";
export {
	checkAcyclic,
	checkDegrees,
	checkDuplicateIds,
	checkEdgeCrossings,
	checkEdgeDirection,
	checkEdgesThroughNodes,
	checkInvariants,
	checkPositions,
	checkReferentialIntegrity,
} from "./validate/invariants.js";
export { validateMap } from "./validate/map.js";
export { emptyState, validateState } from "./validate/state.js";
