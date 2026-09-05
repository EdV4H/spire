import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [react()],
	server: { host: "127.0.0.1", port: 4590 },
	// Resolve workspace packages from source so an edit in packages/* shows up
	// without a rebuild. The playground is where the SDK gets exercised; making
	// that loop slow defeats the point of having it.
	resolve: { conditions: ["source"] },
});
