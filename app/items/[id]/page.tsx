import { notFound } from "next/navigation";
import Link from "next/link";
import { ItemIcon } from "@/components/item-icon";
import { RecipeCard } from "@/components/item-detail/recipe-card";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import {
  allItems,
  getItem,
  itemBySlug,
  recipesConsuming,
  recipesProducing,
} from "@/lib/data";

export function generateStaticParams() {
  return allItems().map((it) => ({ id: it.slug }));
}

interface PageProps {
  params: { id: string };
}

export function generateMetadata({ params }: PageProps) {
  const item = itemBySlug(params.id) ?? getItem(params.id);
  if (!item) return { title: "Item not found" };
  return {
    title: item.name,
    description: item.description || undefined,
  };
}

export default function ItemPage({ params }: PageProps) {
  const item = itemBySlug(params.id) ?? getItem(params.id);
  if (!item) notFound();

  const produced = recipesProducing(item.id);
  const producers = produced.filter((r) => !r.alternate);
  const alternates = produced.filter((r) => r.alternate);
  const consumers = recipesConsuming(item.id);

  return (
    <main className="mx-auto max-w-5xl p-4 pb-8 sm:p-6">
      <nav className="mb-4 text-xs text-gray-500">
        <Link href="/" className="hover:text-gray-200">
          ← Back to Planner
        </Link>
      </nav>

      <header className="card p-6">
        <div className="flex items-start gap-4">
          <ItemIcon iconUrl={item.iconUrl} alt={item.name} size={96} />
          <div className="flex-1">
            <h1 className="text-2xl font-semibold">{item.name}</h1>
            <p className="mt-1 text-sm uppercase tracking-wide text-gray-500">
              {item.category} · {item.form}
            </p>
            <p className="mt-3 whitespace-pre-line text-sm text-gray-300">
              {item.description || "—"}
            </p>
            <div className="mt-4 flex flex-wrap gap-3 text-sm">
              <span className="chip">Stack size: {item.stackSize}</span>
              <span className="chip">Sink points: {item.sinkPoints}</span>
              {item.energyValue > 0 && (
                <span className="chip">Energy: {item.energyValue} MJ</span>
              )}
              {item.radioactiveDecay > 0 && (
                <span className="chip border-red-500/50 text-red-300">
                  Radioactive
                </span>
              )}
              {item.isRaw && (
                <span className="chip border-green-500/50 text-green-300">
                  Raw Resource
                </span>
              )}
            </div>
          </div>
        </div>
      </header>

      <CollapsibleSection
        title={`Recipes · ${producers.length}`}
        className="mt-6"
        contentClassName="space-y-3"
        heading="h2"
      >
        {producers.length === 0 ? (
          <p className="text-sm text-gray-500">No standard recipe.</p>
        ) : (
          producers.map((r) => <RecipeCard key={r.id} recipe={r} />)
        )}
      </CollapsibleSection>

      {alternates.length > 0 && (
        <CollapsibleSection
          title={`Alternate recipes · ${alternates.length}`}
          className="mt-6"
          contentClassName="space-y-3"
          heading="h2"
        >
          {alternates.map((r) => (
            <RecipeCard key={r.id} recipe={r} />
          ))}
        </CollapsibleSection>
      )}

      <CollapsibleSection
        title={`Used to craft · ${consumers.length}`}
        className="mt-6"
        contentClassName="space-y-3"
        heading="h2"
      >
        {consumers.length === 0 ? (
          <p className="text-sm text-gray-500">Not used as an ingredient.</p>
        ) : (
          <div className="space-y-3">
            {consumers.map((r) => (
              <RecipeCard
                key={r.id}
                recipe={r}
                emphasizeItemId={item.id}
              />
            ))}
          </div>
        )}
      </CollapsibleSection>
    </main>
  );
}
