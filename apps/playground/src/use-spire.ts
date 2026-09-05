import { createSpire, type PluginError, type Spire } from "@edv4h/spire-core";
import { useEffect, useState } from "react";
import { availablePlugins, type PluginEntry } from "./plugins.js";

export interface SpireState {
	spire: Spire | undefined;
	errors: readonly PluginError[];
	loading: boolean;
}

/**
 * Build a Spire from the enabled plugin ids, tearing the previous one down.
 *
 * The plugin list is assembled **per mount**, never at module scope: two Spire
 * instances must not share plugin state, and a module-level array would hand
 * the same instances to both. Under React StrictMode's double-mount this is not
 * theoretical.
 */
export function useSpire(enabledIds: readonly string[]): SpireState {
	const [state, setState] = useState<SpireState>({
		spire: undefined,
		errors: [],
		loading: true,
	});

	// The effect depends on the joined ids rather than the array, so a re-render
	// with an equal-but-new array does not rebuild the whole plugin graph — and
	// it reads the ids back out of that same string, so there is no dependency
	// the linter cannot see.
	const key = [...enabledIds].sort().join(",");

	useEffect(() => {
		let cancelled = false;
		let built: Spire | undefined;

		setState((current) => ({ ...current, loading: true }));

		const ids = key.split(",").filter((id) => id.length > 0);
		const entries = availablePlugins.filter((entry: PluginEntry) => ids.includes(entry.id));

		createSpire({ plugins: entries.map((entry) => entry.create()) })
			.then((result) => {
				if (cancelled) {
					if (result.ok) void result.value.destroy();
					return;
				}
				if (result.ok) {
					built = result.value;
					setState({ spire: result.value, errors: [], loading: false });
				} else {
					setState({ spire: undefined, errors: result.error, loading: false });
				}
			})
			.catch((error: unknown) => {
				if (cancelled) return;
				setState({
					spire: undefined,
					loading: false,
					errors: [
						{
							code: "setup_failed",
							message: error instanceof Error ? error.message : String(error),
						},
					],
				});
			});

		return () => {
			cancelled = true;
			void built?.destroy();
		};
	}, [key]);

	return state;
}
