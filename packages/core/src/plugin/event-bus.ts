/**
 * Minimal pub/sub for plugin-to-plugin and SDK-to-host notification.
 *
 * Two things it deliberately does not do:
 *
 * - **No pause/resume.** uSketch's ref-counted global mute is reachable from
 *   every plugin, and a leaked `pause()` silently drops every later event.
 * - **No logging.** A throwing handler cannot break the emit loop, but the SDK
 *   will not write to the console either; `emit` returns what was thrown so the
 *   host decides.
 */

export interface EventHandlerError {
	event: string;
	error: unknown;
}

export type Unsubscribe = () => void;

export interface EventBus {
	on<T = unknown>(event: string, handler: (payload: T) => void): Unsubscribe;
	once<T = unknown>(event: string, handler: (payload: T) => void): Unsubscribe;
	/** Returns whatever handlers threw. Empty in the normal case. */
	emit<T = unknown>(event: string, payload: T): readonly EventHandlerError[];
	listenerCount(event: string): number;
}

/** Events the SDK itself emits. Plugins may emit any other string. */
export const CORE_EVENTS = {
	nodeCompleted: "node:completed",
	nodeUncompleted: "node:uncompleted",
	stateMerged: "state:merged",
} as const;

type AnyHandler = (payload: never) => void;

export function createEventBus(): EventBus {
	const handlers = new Map<string, Set<AnyHandler>>();

	const on = (event: string, handler: AnyHandler): Unsubscribe => {
		let set = handlers.get(event);
		if (set === undefined) {
			set = new Set();
			handlers.set(event, set);
		}
		set.add(handler);
		return () => {
			const current = handlers.get(event);
			if (current === undefined) return;
			current.delete(handler);
			if (current.size === 0) handlers.delete(event);
		};
	};

	return {
		on: on as EventBus["on"],
		once(event, handler) {
			const off = on(event, ((payload: never) => {
				off();
				(handler as AnyHandler)(payload);
			}) as AnyHandler);
			return off;
		},
		emit(event, payload) {
			const set = handlers.get(event);
			if (set === undefined) return [];
			const errors: EventHandlerError[] = [];
			// Snapshot: a handler may subscribe or unsubscribe during dispatch.
			for (const handler of [...set]) {
				try {
					(handler as (value: unknown) => void)(payload);
				} catch (error) {
					errors.push({ event, error });
				}
			}
			return errors;
		},
		listenerCount(event) {
			return handlers.get(event)?.size ?? 0;
		},
	};
}
