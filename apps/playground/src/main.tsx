import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app.js";
import "./styles.css";

const root = document.getElementById("root");
if (root === null) throw new Error("#root is missing from index.html");

// StrictMode on purpose: it double-mounts, which is exactly the condition that
// catches a plugin holding instance state at module scope.
createRoot(root).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
