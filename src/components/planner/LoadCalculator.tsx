import { useMemo, useState } from "react";
import { Plus, Trash2, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  APPLIANCE_PRESETS,
  applianceDailyKwh,
  presetToAppliance,
  summariseUsage,
  type Appliance,
} from "@/lib/appliances";
import { Progress } from "@/components/ui/progress";

interface LoadCalculatorProps {
  appliances: Appliance[];
  onChange: (appliances: Appliance[]) => void;
  /** Annual solar production, kWh. */
  solarAnnualKwh: number;
  /** Peak array output, watts AC. */
  solarPeakWatts: number;
}

const GROUPS = ["Kitchen", "Comfort", "Laundry", "Electronics", "Outdoor", "Transport"] as const;

function NumberCell({
  value,
  onChange,
  step = 1,
  min = 0,
  max = 100000,
  suffix,
}: {
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
}) {
  return (
    <div className="relative">
      <input
        type="number"
        inputMode="decimal"
        value={Number.isFinite(value) ? value : 0}
        step={step}
        min={min}
        max={max}
        onChange={(event) => {
          const next = Number.parseFloat(event.target.value);
          onChange(Number.isFinite(next) ? Math.min(max, Math.max(min, next)) : 0);
        }}
        className="numeric h-8 w-full rounded-md border border-border bg-card px-2 text-right text-xs tabular-nums outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20"
      />
      {suffix && (
        <span className="pointer-events-none absolute top-1/2 right-1.5 -translate-y-1/2 text-[10px] text-muted-foreground">
          {suffix}
        </span>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  unit,
  hint,
}: {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card/60 px-3 py-2.5">
      <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <p className="numeric mt-1 text-lg leading-none font-semibold">
        {value}
        {unit ? (
          <span className="ml-1 text-xs font-medium text-muted-foreground">
            {unit}
          </span>
        ) : null}
      </p>
      {hint && <p className="mt-1 text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function LoadCalculator({
  appliances,
  onChange,
  solarAnnualKwh,
  solarPeakWatts,
}: LoadCalculatorProps) {
  const [groupFilter, setGroupFilter] = useState<string>("Kitchen");
  const usage = useMemo(() => summariseUsage(appliances), [appliances]);
  const coverage =
    usage.annualKwh > 0 ? Math.min(150, (solarAnnualKwh / usage.annualKwh) * 100) : 0;

  const update = (id: string, patch: Partial<Appliance>) => {
    onChange(
      appliances.map((appliance) =>
        appliance.id === id ? { ...appliance, ...patch } : appliance,
      ),
    );
  };

  const addPreset = (presetId: string) => {
    const preset = APPLIANCE_PRESETS.find((item) => item.id === presetId);
    if (!preset) return;
    onChange([...appliances, presetToAppliance(preset, appliances.length)]);
  };

  const remove = (id: string) => {
    onChange(appliances.filter((appliance) => appliance.id !== id));
  };

  const presetsInGroup = APPLIANCE_PRESETS.filter(
    (preset) => preset.group === groupFilter,
  );

  return (
    <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Stat
          label="Per day"
          value={usage.dailyKwh.toFixed(1)}
          unit="kWh"
          hint={`${appliances.length} appliances`}
        />
        <Stat
          label="Per year"
          value={Math.round(usage.annualKwh).toLocaleString()}
          unit="kWh"
        />
        <Stat
          label="Solar covers"
          value={coverage.toFixed(0)}
          unit="%"
          hint={`${Math.round(solarAnnualKwh).toLocaleString()} kWh generated`}
        />
        <Stat
          label="Connected load"
          value={(usage.connectedWatts / 1000).toFixed(1)}
          unit="kW"
          hint="If everything ran at once"
        />
      </div>

      <div className="space-y-2 rounded-lg border border-border bg-card/60 p-3">
        <div className="flex items-baseline justify-between text-xs">
          <span className="flex items-center gap-1.5 font-medium">
            <Zap className="size-3.5 text-primary" />
            Solar against your usage
          </span>
          <span className="numeric text-muted-foreground">
            {coverage.toFixed(0)}% covered
          </span>
        </div>
        <Progress value={Math.min(100, coverage)} className="h-2" />
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Array peak is {(solarPeakWatts / 1000).toFixed(2)} kW AC against{" "}
          {(usage.connectedWatts / 1000).toFixed(1)} kW of connected load — the
          array runs the whole house except when several heavy appliances overlap.
        </p>
      </div>

      {/* Add appliance */}
      <div className="flex gap-2">
        <Select value={groupFilter} onValueChange={setGroupFilter}>
          <SelectTrigger className="h-9 w-[132px] cursor-pointer text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {GROUPS.map((group) => (
              <SelectItem key={group} value={group} className="text-xs">
                {group}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value="" onValueChange={addPreset}>
          <SelectTrigger className="h-9 flex-1 cursor-pointer text-xs">
            <SelectValue placeholder="Add an appliance…" />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectGroup>
              <SelectLabel className="text-[10px] uppercase">
                {groupFilter}
              </SelectLabel>
              {presetsInGroup.map((preset) => (
                <SelectItem key={preset.id} value={preset.id} className="text-xs">
                  {preset.name} · {preset.watts} W · {preset.hours} h/day
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="size-9 shrink-0 cursor-pointer"
          onClick={() => addPreset(presetsInGroup[0]?.id ?? "fridge")}
          aria-label="Add the first appliance in this category"
        >
          <Plus className="size-4" />
        </Button>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-left text-xs">
          <thead className="bg-muted/60 text-[10px] tracking-wide text-muted-foreground uppercase">
            <tr>
              <th className="px-2.5 py-2 font-medium">Appliance</th>
              <th className="w-16 px-1.5 py-2 text-center font-medium">Qty</th>
              <th className="w-20 px-1.5 py-2 text-center font-medium">Watts</th>
              <th className="w-20 px-1.5 py-2 text-center font-medium">Hrs/day</th>
              <th className="w-20 px-1.5 py-2 text-right font-medium">kWh/day</th>
              <th className="w-9" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {appliances.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-6 text-center text-muted-foreground"
                >
                  Add appliances to see what the array has to cover.
                </td>
              </tr>
            )}
            {appliances.map((appliance) => {
              const share = usage.shares[appliance.id] ?? 0;
              return (
                <tr key={appliance.id} className="group">
                  <td className="px-2.5 py-1.5">
                    <input
                      value={appliance.name}
                      onChange={(event) =>
                        update(appliance.id, { name: event.target.value })
                      }
                      className="w-full rounded-md border border-transparent bg-transparent px-1 py-1 text-xs font-medium outline-none hover:border-border focus-visible:border-primary focus-visible:bg-card"
                    />
                    <div className="mt-1 flex items-center gap-1.5">
                      <div className="h-1 w-16 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary/70"
                          style={{ width: `${Math.max(2, share * 100)}%` }}
                        />
                      </div>
                      <span className="numeric text-[10px] text-muted-foreground">
                        {(share * 100).toFixed(0)}% of use
                      </span>
                    </div>
                  </td>
                  <td className="px-1.5 py-1.5">
                    <NumberCell
                      value={appliance.quantity}
                      onChange={(value) =>
                        update(appliance.id, { quantity: Math.round(value) })
                      }
                      min={1}
                      max={99}
                    />
                  </td>
                  <td className="px-1.5 py-1.5">
                    <NumberCell
                      value={appliance.watts}
                      onChange={(value) => update(appliance.id, { watts: value })}
                      step={10}
                      min={1}
                      max={20000}
                    />
                  </td>
                  <td className="px-1.5 py-1.5">
                    <NumberCell
                      value={appliance.hours}
                      onChange={(value) => update(appliance.id, { hours: value })}
                      step={0.5}
                      min={0}
                      max={24}
                    />
                  </td>
                  <td className="numeric px-1.5 py-1.5 text-right font-medium">
                    {applianceDailyKwh(appliance).toFixed(2)}
                  </td>
                  <td className="px-1 py-1.5 text-right">
                    <button
                      type="button"
                      aria-label={`Remove ${appliance.name}`}
                      onClick={() => remove(appliance.id)}
                      className="cursor-pointer rounded-md p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {appliances.length > 0 && (
            <tfoot className="border-t border-border bg-muted/40 text-xs">
              <tr>
                <td className="px-2.5 py-2 font-medium" colSpan={4}>
                  Household total
                </td>
                <td className="numeric px-1.5 py-2 text-right font-semibold">
                  {usage.dailyKwh.toFixed(2)}
                </td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Wattages are average draw while running, so watts × hours reproduces
        published consumption figures. Some appliances, like a fridge or a
        heat pump, cycle on and off but average out to the figure shown.
      </p>
    </div>
  );
}
