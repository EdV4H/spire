import { describe, expect, it } from "vitest";
import { createSpire } from "./create-spire.js";
import type { PluginContext, PluginTeardown, SpirePlugin } from "./plugin.js";
import { SPIRE_PLUGIN_API_VERSION } from "./plugin.js";
import { defineService } from "./service.js";

/**
 * These tests pin the plugin contract itself. They are the executable version
 * of the rules in `plugin.ts`: factory-produced plugins, teardown returned from
 * `setup`, LIFO teardown, rollback on failure, and no silent id collisions.
 */

function makePlugin(
	id: string,
	// biome-ignore lint/suspicious/noConfusingVoidType: mirrors SpirePlugin["setup"].
	setup: (ctx: PluginContext) => PluginTeardown | void | Promise<PluginTeardown | void>,
	dependencies?: readonly string[],
): SpirePlugin {
	return {
		id,
		name: id,
		apiVersion: SPIRE_PLUGIN_API_VERSION,
		...(dependencies === undefined ? {} : { dependencies }),
		setup,
	};
}

function noopPolicy(id: string) {
	return { id, canComplete: () => true };
}

describe("createSpire — plugin ordering", () => {
	it("sets up plugins in dependency order, not array order", async () => {
		const order: string[] = [];
		const result = await createSpire({
			plugins: [
				makePlugin("c", () => void order.push("c"), ["b"]),
				makePlugin("b", () => void order.push("b"), ["a"]),
				makePlugin("a", () => void order.push("a")),
			],
		});

		expect(result.ok).toBe(true);
		expect(order).toEqual(["a", "b", "c"]);
	});

	it("keeps input order among independent plugins", async () => {
		const order: string[] = [];
		const result = await createSpire({
			plugins: [
				makePlugin("x", () => void order.push("x")),
				makePlugin("y", () => void order.push("y")),
				makePlugin("z", () => void order.push("z")),
			],
		});

		expect(result.ok).toBe(true);
		expect(order).toEqual(["x", "y", "z"]);
	});

	it("reports a missing dependency instead of silently ignoring it", async () => {
		const result = await createSpire({
			plugins: [makePlugin("a", () => {}, ["not-installed"])],
		});

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error[0]?.code).toBe("missing_dependency");
		expect(result.error[0]?.meta?.dependency).toBe("not-installed");
	});

	it("reports a dependency cycle", async () => {
		const result = await createSpire({
			plugins: [makePlugin("a", () => {}, ["b"]), makePlugin("b", () => {}, ["a"])],
		});

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.map((e) => e.code)).toContain("cyclic_dependency");
	});

	it("rejects two plugins with the same id", async () => {
		const result = await createSpire({
			plugins: [makePlugin("dup", () => {}), makePlugin("dup", () => {})],
		});

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error[0]?.code).toBe("duplicate_plugin_id");
	});

	it("rejects a plugin built against another API version", async () => {
		const stale = {
			...makePlugin("stale", () => {}),
			apiVersion: 99 as unknown as typeof SPIRE_PLUGIN_API_VERSION,
		};

		const result = await createSpire({ plugins: [stale] });

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error[0]?.code).toBe("api_version_mismatch");
	});
});

describe("createSpire — lifecycle", () => {
	it("runs teardowns in LIFO order", async () => {
		const order: string[] = [];
		const result = await createSpire({
			plugins: [
				makePlugin("first", () => () => void order.push("first")),
				makePlugin("second", () => () => void order.push("second")),
			],
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		await result.value.destroy();
		expect(order).toEqual(["second", "first"]);
	});

	it("destroy() is idempotent — teardowns run once", async () => {
		const teardownCalls: string[] = [];
		const result = await createSpire({
			plugins: [makePlugin("a", () => () => void teardownCalls.push("a"))],
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		await result.value.destroy();
		await result.value.destroy();
		expect(teardownCalls).toEqual(["a"]);
	});

	it("rolls back already-collected teardowns when a later setup throws", async () => {
		const torn: string[] = [];
		const result = await createSpire({
			plugins: [
				makePlugin("a", () => () => void torn.push("a")),
				makePlugin("b", () => () => void torn.push("b")),
				makePlugin("boom", () => {
					throw new Error("nope");
				}),
			],
		});

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error[0]?.code).toBe("setup_failed");
		expect(result.error[0]?.pluginId).toBe("boom");
		expect(torn).toEqual(["b", "a"]);
	});

	it("awaits an async setup before starting the next plugin", async () => {
		const order: string[] = [];
		const result = await createSpire({
			plugins: [
				makePlugin("slow", async () => {
					await Promise.resolve();
					await Promise.resolve();
					order.push("slow");
				}),
				makePlugin("fast", () => void order.push("fast"), ["slow"]),
			],
		});

		expect(result.ok).toBe(true);
		expect(order).toEqual(["slow", "fast"]);
	});

	it("returns teardown failures from destroy() rather than throwing", async () => {
		const result = await createSpire({
			plugins: [
				makePlugin("bad", () => () => {
					throw new Error("teardown boom");
				}),
			],
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const failures = await result.value.destroy();
		expect(failures[0]?.code).toBe("teardown_failed");
		expect(failures[0]?.pluginId).toBe("bad");
	});

	it("keeps two instances independent", async () => {
		const a = await createSpire({
			plugins: [makePlugin("p", (ctx) => void ctx.policies.register(noopPolicy("only-in-a")))],
		});
		const b = await createSpire({ plugins: [] });

		expect(a.ok && b.ok).toBe(true);
		if (!a.ok || !b.ok) return;
		expect(a.value.policies.has("only-in-a")).toBe(true);
		expect(b.value.policies.has("only-in-a")).toBe(false);

		await a.value.destroy();
		expect(b.value.policies.has("strict")).toBe(true);
	});
});

describe("createSpire — registries", () => {
	it("provides the built-in policies with no plugins, strictest first", async () => {
		const result = await createSpire();

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.policies.ids()).toEqual(["single-route", "strict", "free"]);
	});

	it("fails creation on a duplicate registry id instead of overwriting", async () => {
		const result = await createSpire({
			plugins: [
				makePlugin("a", (ctx) => void ctx.policies.register(noopPolicy("shared"))),
				makePlugin("b", (ctx) => void ctx.policies.register(noopPolicy("shared"))),
			],
		});

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error[0]?.code).toBe("registry_conflict");
		expect(result.error[0]?.pluginId).toBe("b");
	});

	it("allows a deliberate override", async () => {
		const marker = { id: "strict", canComplete: () => false };
		const result = await createSpire({
			plugins: [makePlugin("a", (ctx) => void ctx.policies.register(marker, { override: true }))],
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.policies.get("strict")).toBe(marker);
	});

	it("attributes registrations to the plugin that made them", async () => {
		const result = await createSpire({
			plugins: [makePlugin("author", (ctx) => void ctx.policies.register(noopPolicy("mine")))],
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const mine = result.value.policies.attributions().find((a) => a.entry.id === "mine");
		expect(mine?.pluginId).toBe("author");
	});

	it("does not expose kernel-only registry methods to a plugin", async () => {
		let scoped: unknown;
		const result = await createSpire({
			plugins: [
				makePlugin("peek", (ctx) => {
					scoped = ctx.policies;
				}),
			],
		});

		expect(result.ok).toBe(true);
		const asRecord = scoped as Record<string, unknown>;
		expect(asRecord.registerFor).toBeUndefined();
		expect(asRecord.drainConflicts).toBeUndefined();
		expect(asRecord.scopedFor).toBeUndefined();
	});

	it("guards a stale unregister against a re-registration", async () => {
		const result = await createSpire();
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		const first = noopPolicy("reused");
		const off = result.value.policies.register(first);
		result.value.policies.unregister("reused");

		const second = noopPolicy("reused");
		result.value.policies.register(second);
		off(); // stale: must not remove the newer entry

		expect(result.value.policies.get("reused")).toBe(second);
	});

	it("hands out a defensive copy from getAll", async () => {
		const result = await createSpire();
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		const all = result.value.policies.getAll() as Map<string, unknown>;
		all.delete("strict");

		expect(result.value.policies.has("strict")).toBe(true);
	});
});

describe("createSpire — services", () => {
	it("resolves a service across plugins without importing the provider", async () => {
		interface Counter {
			bump(): number;
		}
		const counterService = defineService<Counter>("test:counter");

		let seen = 0;
		const result = await createSpire({
			plugins: [
				makePlugin("provider", (ctx) => {
					let n = 0;
					return counterService.provide(ctx.services, {
						bump: () => {
							n += 1;
							return n;
						},
					});
				}),
				makePlugin(
					"consumer",
					(ctx) => {
						seen = counterService.get(ctx.services)?.bump() ?? -1;
					},
					["provider"],
				),
			],
		});

		expect(result.ok).toBe(true);
		expect(seen).toBe(1);
	});

	it("removes a service when its providing plugin is torn down", async () => {
		const service = defineService<{ ok: true }>("test:teardown");
		const result = await createSpire({
			plugins: [makePlugin("provider", (ctx) => service.provide(ctx.services, { ok: true }))],
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(service.has(result.value.services)).toBe(true);

		await result.value.destroy();
		expect(service.has(result.value.services)).toBe(false);
	});
});

describe("createSpire — events", () => {
	it("returns handler errors instead of breaking the emit loop", async () => {
		const result = await createSpire();
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		const seen: string[] = [];
		result.value.events.on("x", () => {
			throw new Error("handler boom");
		});
		result.value.events.on("x", () => void seen.push("second"));

		const errors = result.value.events.emit("x", null);

		expect(seen).toEqual(["second"]);
		expect(errors).toHaveLength(1);
		expect(errors[0]?.event).toBe("x");
	});
});
