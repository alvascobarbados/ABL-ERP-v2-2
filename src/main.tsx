import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { installHapticsUnlock } from "./lib/haptics";

installHapticsUnlock();

createRoot(document.getElementById("root")!).render(<App />);
