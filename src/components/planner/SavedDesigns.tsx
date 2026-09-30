import type { Doc } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Save, Trash2 } from "lucide-react";
import { useState } from "react";

export type SavedDesign = Doc<"designs">;

interface SavedDesignsProps {
  designs: SavedDesign[];
  onSave: (name: string) => void;
  onLoad: (design: SavedDesign) => void;
  onDelete: (id: SavedDesign["_id"]) => void;
  saving: boolean;
}

export function SavedDesigns({
  designs,
  onSave,
  onLoad,
  onDelete,
  saving,
}: SavedDesignsProps) {
  const [name, setName] = useState("");

  const submit = () => {
    const trimmed = name.trim() || `Option ${designs.length + 1}`;
    onSave(trimmed);
    setName("");
  };

  const best = designs.reduce<SavedDesign | null>((winner, design) => {
    if (!winner) return design;
    return design.specificYield > winner.specificYield ? design : winner;
  }, null);

  return (
    <div className="panel-surface space-y-3 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold tracking-tight">Saved options</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Save layout and usage together. Yields are model estimates.
          </p>
        </div>
        <span className="numeric rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {designs.length}
        </span>
      </div>

      <div className="flex gap-2">
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") submit();
          }}
          placeholder="Name this layout"
          className="h-9 text-sm"
        />
        <Button
          type="button"
          size="sm"
          className="h-9 shrink-0 cursor-pointer"
          onClick={submit}
          disabled={saving}
        >
          {saving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          <span className="ml-1.5">Save</span>
        </Button>
      </div>

      {designs.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
          Nothing saved yet. Adjust the roof or pitch, then save an option to
          compare.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/60 text-[10px] tracking-wide text-muted-foreground uppercase">
              <tr>
                <th className="px-2.5 py-2 font-medium">Design</th>
                <th className="px-2 py-2 text-right font-medium">kWp</th>
                <th className="px-2 py-2 text-right font-medium">kWh/yr</th>
                <th className="px-2 py-2 text-right font-medium">kWh/kWp</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {designs.map((design) => (
                <tr
                  key={design._id}
                  className="group cursor-pointer transition-colors hover:bg-muted/50"
                  onClick={() => onLoad(design)}
                >
                  <td className="px-2.5 py-2">
                    <span className="flex items-center gap-1.5 font-medium">
                      {design.name}
                      {best?._id === design._id && (
                        <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-semibold text-primary">
                          TOP YIELD
                        </span>
                      )}
                    </span>
                    <span className="numeric text-[10px] text-muted-foreground">
                      {design.panelCount} panels · {Math.round(design.tilt)}° ·{" "}
                      {Math.round(design.azimuth)}°
                      {!design.project && " · legacy / partial"}
                    </span>
                  </td>
                  <td className="numeric px-2 py-2 text-right">
                    {design.capacityKw.toFixed(2)}
                  </td>
                  <td className="numeric px-2 py-2 text-right">
                    {Math.round(design.annualKwh).toLocaleString()}
                  </td>
                  <td className="numeric px-2 py-2 text-right font-medium">
                    {design.specificYield.toFixed(0)}
                  </td>
                  <td className="px-1 py-2 text-right">
                    <button
                      type="button"
                      aria-label={`Delete ${design.name}`}
                      className="cursor-pointer rounded-md p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100"
                      onClick={(event) => {
                        event.stopPropagation();
                        onDelete(design._id);
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
