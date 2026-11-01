import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { installElectronFetchPolyfill } from "./lib/electron-fetch";

// Masaüstü uygulamasında tüm /api istekleri IPC köprüsünden geçer.
installElectronFetchPolyfill();

createRoot(document.getElementById("root")!).render(<App />);
