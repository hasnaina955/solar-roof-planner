import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Pause, Play, Sunrise, Sunset } from "lucide-react";
import { formatMinutes } from "@/lib/solar";

const MONTH_STARTS = [
  { label: "Jan", doy: 1 },
  { label: "Feb", doy: 32 },
  { label: "Mar", doy: 60 },
  { label: "Apr", doy: 91 },
  { label: "May", doy: 121 },
  { label: "Jun", doy: 152 },
  { label: "Jul", doy: 182 },
  { label: "Aug", doy: 213 },
  { label: "Sep", doy: 244 },
  { label: "Oct", doy: 274 },
  { label: "Nov", doy: 305 },
  { label: "Dec", doy: 335 },
];

const SOLSTICES = [
  { label: "Mar 21", doy: 80 },
  { label: "Jun 21", doy: 172 },
  { label: "Sep 21", doy: 264 },
  { label: "Dec 21", doy: 355 },
];

interface TimeBarProps {
  dayOfYear: number;
  onDayChange: (value: number) => void;
  minutes: number;
  onMinutesChange: (value: number) => void;
  sunrise: number;
  sunset: number;
  solarNoon: number;
  isPlaying: boolean;
  onTogglePlay: () => void;
}

export function TimeBar({
  dayOfYear,
  onDayChange,
  minutes,
  onMinutesChange,
  sunrise,
  sunset,
  solarNoon,
  isPlaying,
  onTogglePlay,
}: TimeBarProps) {
  const month = MONTH_STARTS.find(
    (start, index) =>
      dayOfYear >= start.doy && dayOfYear < (MONTH_STARTS[index + 1]?.doy ?? 366),
  );

  return (
    <div className="panel-surface flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:gap-6">
      <div className="flex items-center gap-3 lg:w-[38%]">
        <Button
          type="button"
          size="icon"
          variant={isPlaying ? "default" : "secondary"}
          className="size-9 shrink-0 cursor-pointer"
          onClick={onTogglePlay}
          aria-label={isPlaying ? "Pause day sweep" : "Play day sweep"}
        >
          {isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
        </Button>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-medium tracking-wide uppercase">
            <span className="text-muted-foreground">Date</span>
            <span className="numeric">
              {month?.label} {dayOfYear}
            </span>
          </div>
          <Slider
            value={[dayOfYear]}
            min={1}
            max={365}
            step={1}
            onValueChange={([value]) => onDayChange(value)}
          />
          <div className="flex flex-wrap items-center gap-1"><span className="text-[10px] text-muted-foreground/70">Jump to</span>
            {SOLSTICES.map((mark) => (
              <button
                key={mark.label}
                type="button"
                onClick={() => onDayChange(mark.doy)}
                className={`cursor-pointer rounded-md px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                  dayOfYear === mark.doy
                    ? "bg-primary/12 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {mark.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="hidden h-10 w-px bg-border lg:block" />

      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-center justify-between text-[11px] font-medium tracking-wide uppercase">
          <span className="text-muted-foreground">Time of day</span>
          <span className="numeric text-sm font-semibold normal-case">
            {formatMinutes(minutes)}
          </span>
        </div>
        <Slider
          value={[minutes]}
          min={0}
          max={1440}
          step={5}
          onValueChange={([value]) => onMinutesChange(value)}
        />
        <div className="numeric relative h-4 text-[10px] text-muted-foreground">
          <span className="absolute left-0">00:00</span>
          <span
            className="absolute -translate-x-1/2"
            style={{
              left: `${(sunrise / 1440) * 100}%`,
            }}
          >
            ↑{formatMinutes(sunrise)}
          </span>
          <span
            className="absolute -translate-x-1/2"
            style={{ left: `${(solarNoon / 1440) * 100}%` }}
          >
            noon
          </span>
          <span
            className="absolute -translate-x-1/2"
            style={{ left: `${(sunset / 1440) * 100}%` }}
          >
            ↓{formatMinutes(sunset)}
          </span>
          <span className="absolute right-0">24:00</span>
        </div>
      </div>

      <div className="flex items-center gap-4 text-[11px] text-muted-foreground lg:border-l lg:border-border lg:pl-4">
        <span className="flex items-center gap-1.5">
          <Sunrise className="size-3.5" />
          {formatMinutes(sunrise)}
        </span>
        <span className="flex items-center gap-1.5">
          <Sunset className="size-3.5" />
          {formatMinutes(sunset)}
        </span>
      </div>
    </div>
  );
}
