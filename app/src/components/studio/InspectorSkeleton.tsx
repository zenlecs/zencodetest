/** Lightweight stand-in for the dossier body while the shell springs open. */
export function InspectorSkeleton() {
  return (
    <div className="flex flex-col gap-4 pt-1" aria-hidden="true">
      <section>
        <div className="inspector-bone mb-2 h-2.5 w-14 rounded-full" />
        <div className="flex flex-col gap-2">
          <div className="inspector-bone h-9 w-full rounded-[10px]" />
          <div className="inspector-bone h-9 w-[86%] rounded-[10px]" />
          <div className="inspector-bone h-9 w-[72%] rounded-[10px]" />
          <div className="inspector-bone h-9 w-[92%] rounded-[10px]" />
        </div>
      </section>
      <section>
        <div className="inspector-bone mb-2 h-2.5 w-20 rounded-full" />
        <div className="flex flex-col gap-2">
          <div className="inspector-bone h-9 w-full rounded-[10px]" />
          <div className="inspector-bone h-9 w-[78%] rounded-[10px]" />
          <div className="inspector-bone h-16 w-full rounded-[10px]" />
        </div>
      </section>
    </div>
  );
}
