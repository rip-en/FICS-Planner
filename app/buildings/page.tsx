import Link from "next/link";
import { ItemIcon } from "@/components/item-icon";
import { allBuildings } from "@/lib/data";
import { formatPower } from "@/lib/utils";

export const metadata = { title: "Buildings" };

const KIND_ORDER: Record<string, number> = {
  extractor: 0,
  manufacturer: 1,
  generator: 2,
  other: 3,
};

export default function BuildingsPage() {
  const buildings = allBuildings()
    .filter((b) => b.kind !== "other")
    .sort(
      (a, b) =>
        (KIND_ORDER[a.kind] ?? 99) - (KIND_ORDER[b.kind] ?? 99) ||
        a.name.localeCompare(b.name),
    );

  return (
    <main className="mx-auto max-w-5xl p-6">
      <nav className="mb-4 text-xs text-gray-500">
        <Link href="/" className="hover:text-gray-200">
          ← Back to Planner
        </Link>
      </nav>
      <h1 className="mb-4 text-2xl font-semibold">
        Buildings{" "}
        <span className="text-sm font-normal text-gray-500">
          ({buildings.length})
        </span>
      </h1>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {buildings.map((b) => (
          <div key={b.id} className="card flex gap-3 p-3">
            <ItemIcon iconUrl={b.iconUrl} alt={b.name} size={56} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <div className="truncate text-sm font-medium">{b.name}</div>
                <span className="chip capitalize">{b.kind}</span>
              </div>
              {b.powerConsumption !== 0 && (
                <div className="text-xs text-gray-400">
                  {b.powerConsumption > 0 ? "Consumes " : "Produces "}
                  {formatPower(Math.abs(b.powerConsumption))}
                </div>
              )}
              <p className="mt-1 line-clamp-3 text-xs text-gray-500">
                {b.description}
              </p>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
