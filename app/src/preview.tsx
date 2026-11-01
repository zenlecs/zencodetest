import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import StudioPage from "@/pages/studio";
import "./index.css";

const client = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={client}>
    <div className="w-screen h-screen overflow-hidden bg-[#0a0a0c]">
      <StudioPage />
    </div>
  </QueryClientProvider>,
);
