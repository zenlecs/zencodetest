import { queryClient } from "@/lib/queryClient";

export type IslandHost = {
  attached: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  originX: number;
  originY: number;
};

const NOTIFICATION_KEY = "/api/notifications";

let applyingRemote = false;

export function bindIslandNotifications() {
  const electron = window.electron;
  if (!electron) return () => {};

  const onRemote = (data: unknown) => {
    applyingRemote = true;
    queryClient.setQueryData([NOTIFICATION_KEY], data);
    applyingRemote = false;
  };
  electron.receive("island-notifications", onRemote);

  const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
    if (applyingRemote) return;
    if (event.type !== "updated") return;
    const key = event.query.queryKey;
    if (!Array.isArray(key) || key[0] !== NOTIFICATION_KEY) return;
    if (event.query.state.data === undefined) return;
    electron.send("island-notifications", event.query.state.data);
  });

  return () => {
    unsubscribe();
    electron.removeListener("island-notifications", onRemote);
  };
}
