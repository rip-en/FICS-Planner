import { MousePointerClick, Search, Sparkles, Target } from "lucide-react";

export function PlannerEmptyState() {
  const steps = [
    {
      icon: Search,
      title: "Find an item",
      body: "Use the catalog search on the left. Press / anywhere to jump to it.",
    },
    {
      icon: MousePointerClick,
      title: "Double-click to target",
      body: "Double-clicking any item adds it as a production target with a default rate of 60/min.",
    },
    {
      icon: Target,
      title: "Tune it",
      body: "Adjust the target rate, toggle alternate recipes, or disable producers you don't want.",
    },
    {
      icon: Sparkles,
      title: "See the plan",
      body: "The solver computes building counts, power draw, raw resources, and byproducts live.",
    },
  ];
  return (
    <div className="card p-6">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
        Build a production plan
      </h2>
      <p className="mt-1 text-xs text-gray-500">
        No targets yet. Add items from the catalog to get started.
      </p>
      <ol className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {steps.map((s, i) => {
          const Icon = s.icon;
          return (
            <li
              key={s.title}
              className="flex gap-3 rounded-md border border-surface-border bg-surface p-3"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand/15 text-brand">
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-sm font-medium text-gray-100">
                  <span className="text-gray-500">{i + 1}.</span>
                  {s.title}
                </div>
                <div className="mt-0.5 text-xs text-gray-400">{s.body}</div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
