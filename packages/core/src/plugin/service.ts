/**
 * Typed IoC rendezvous between plugins, and the sanctioned way for a plugin to
 * expose an API to the host.
 *
 * A consumer resolves a capability by key without importing the provider's
 * package, so `@edv4h/spire-gen` can define its own registries (rules,
 * skeletons, assigners, content providers) without `@edv4h/spire-core` ever
 * learning what a generation rule is. The kernel's contract stays free of
 * single-feature concerns.
 *
 * Unlike the id-addressed registries, providing over an occupied key is
 * **allowed**: a service key has exactly one owner by convention, and which
 * plugins are loaded is the host's explicit choice. Registry ids, by contrast,
 * are addressed from serialized documents, where a silent replacement would
 * change what a stored GenSpec means.
 */

export type Unprovide = () => void;

export interface ServiceRegistry {
	provide<T>(key: string, service: T): Unprovide;
	get<T>(key: string): T | undefined;
	has(key: string): boolean;
	/** Keys currently provided, in provision order. */
	keys(): readonly string[];
}

export interface ServiceHandle<T> {
	/** The registry key. Namespace it with the providing package name. */
	readonly key: string;
	provide(services: ServiceRegistry, api: T): Unprovide;
	/** The service, or `undefined` when the providing plugin is absent. */
	get(services: ServiceRegistry): T | undefined;
	has(services: ServiceRegistry): boolean;
}

/**
 * Declare a service key once, next to its interface, and export the handle.
 * Consumers then get compile-time types without a cast at the call site.
 */
export function defineService<T>(key: string): ServiceHandle<T> {
	return {
		key,
		provide: (services, api) => services.provide<T>(key, api),
		get: (services) => services.get<T>(key),
		has: (services) => services.has(key),
	};
}

export function createServiceRegistry(): ServiceRegistry {
	const services = new Map<string, unknown>();

	return {
		provide(key, service) {
			services.set(key, service);
			return () => {
				// Stale guard: a late unprovide must not remove a newer service.
				if (services.get(key) === service) services.delete(key);
			};
		},
		get<T>(key: string): T | undefined {
			return services.get(key) as T | undefined;
		},
		has(key) {
			return services.has(key);
		},
		keys() {
			return [...services.keys()];
		},
	};
}
