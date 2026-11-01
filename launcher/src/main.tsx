import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { installElectronFetchPolyfill } from "./lib/electron-fetch";

installElectronFetchPolyfill();

createRoot(document.getElementById("root")!).render(<App />);
