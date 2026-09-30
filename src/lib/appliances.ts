/**
 * Household load model.
 *
 * Appliance wattages are illustrative average draws while running, not
 * nameplate peaks or startup surges. Watts × hours estimates consumption;
 * it cannot determine simultaneous operation or actual bill savings.
 */

export interface Appliance {
  id: string;
  name: string;
  /** Average draw while running, watts. */
  watts: number;
  quantity: number;
  /** Hours of operation per day, per unit. */
  hours: number;
}

export interface AppliancePreset {
  id: string;
  name: string;
  watts: number;
  hours: number;
  /** Typical number of these in a house. */
  quantity: number;
  group: "Kitchen" | "Comfort" | "Laundry" | "Electronics" | "Outdoor" | "Transport";
  note: string;
}

export const APPLIANCE_PRESETS: AppliancePreset[] = [
  { id: "fridge", name: "Refrigerator", watts: 80, hours: 24, quantity: 1, group: "Kitchen", note: "Compressor duty cycle averages about 80 W" },
  { id: "freezer", name: "Chest freezer", watts: 70, hours: 24, quantity: 1, group: "Kitchen", note: "Runs continuously, cycles on and off" },
  { id: "oven", name: "Oven & range", watts: 2200, hours: 0.8, quantity: 1, group: "Kitchen", note: "Average over cooking time" },
  { id: "microwave", name: "Microwave", watts: 1000, hours: 0.4, quantity: 1, group: "Kitchen", note: "A few minutes at a time" },
  { id: "kettle", name: "Kettle", watts: 1500, hours: 0.3, quantity: 1, group: "Kitchen", note: "Short high-power bursts" },
  { id: "dishwasher", name: "Dishwasher", watts: 1200, hours: 1, quantity: 1, group: "Kitchen", note: "One cycle, mostly heating water" },
  { id: "coffee", name: "Coffee maker", watts: 900, hours: 0.3, quantity: 1, group: "Kitchen", note: "Brew plus hotplate" },
  { id: "ac", name: "Air conditioner", watts: 1500, hours: 5, quantity: 1, group: "Comfort", note: "1.5-ton split, duty-cycled" },
  { id: "ac-large", name: "Central AC", watts: 3500, hours: 6, quantity: 1, group: "Comfort", note: "Whole-home system" },
  { id: "heat-pump", name: "Heat pump", watts: 1800, hours: 6, quantity: 1, group: "Comfort", note: "Heating season average" },
  { id: "space-heater", name: "Space heater", watts: 1500, hours: 4, quantity: 1, group: "Comfort", note: "Resistive, runs flat out" },
  { id: "water-heater", name: "Water heater", watts: 3000, hours: 1.5, quantity: 1, group: "Comfort", note: "Electric tank, recovery time" },
  { id: "fans", name: "Ceiling fans", watts: 70, hours: 8, quantity: 2, group: "Comfort", note: "Per fan, on a low setting" },
  { id: "washer", name: "Washing machine", watts: 500, hours: 1, quantity: 1, group: "Laundry", note: "Per cycle" },
  { id: "dryer", name: "Clothes dryer", watts: 2500, hours: 0.8, quantity: 1, group: "Laundry", note: "Electric, per load" },
  { id: "tv", name: "TV & media", watts: 90, hours: 4, quantity: 2, group: "Electronics", note: "Modern flat panel plus box" },
  { id: "computer", name: "Computer", watts: 80, hours: 6, quantity: 2, group: "Electronics", note: "Laptop or desktop plus screen" },
  { id: "lighting", name: "LED lighting", watts: 12, hours: 5, quantity: 12, group: "Electronics", note: "Per bulb" },
  { id: "standby", name: "Standby & always-on", watts: 150, hours: 24, quantity: 1, group: "Electronics", note: "Router, modem, chargers, clocks" },
  { id: "pool", name: "Pool pump", watts: 1100, hours: 4, quantity: 1, group: "Outdoor", note: "Daily filtration run" },
  { id: "well-pump", name: "Well pump", watts: 1000, hours: 1.5, quantity: 1, group: "Outdoor", note: "Pressure-cycle average" },
  { id: "ev", name: "EV charger", watts: 7200, hours: 2, quantity: 1, group: "Transport", note: "Level 2, about 60 km of range" },
];

export function presetToAppliance(preset: AppliancePreset, index: number): Appliance {
  return {
    id: `${preset.id}-${index}-${Date.now()}`,
    name: preset.name,
    watts: preset.watts,
    quantity: preset.quantity,
    hours: preset.hours,
  };
}

/**
 * A plausible starting household: roughly 9,300 kWh a year, close to the US
 * residential average, with no EV so there is an obvious thing to add.
 */
export function defaultAppliances(): Appliance[] {
  const ids = [
    "fridge",
    "lighting",
    "tv",
    "computer",
    "standby",
    "ac",
    "water-heater",
    "washer",
    "dryer",
    "dishwasher",
    "oven",
  ];
  return ids
    .map((id, index) => {
      const preset = APPLIANCE_PRESETS.find((item) => item.id === id);
      return preset ? presetToAppliance(preset, index) : null;
    })
    .filter((item): item is Appliance => item !== null);
}

export function applianceDailyKwh(appliance: Appliance): number {
  return (appliance.watts * appliance.quantity * appliance.hours) / 1000;
}

export function applianceConnectedWatts(appliance: Appliance): number {
  return appliance.watts * appliance.quantity;
}

export interface UsageSummary {
  dailyKwh: number;
  monthlyKwh: number;
  annualKwh: number;
  /** Sum of every appliance's draw if they all ran simultaneously, watts. */
  connectedWatts: number;
  /** Share of the year's usage each appliance is responsible for, 0..1. */
  shares: Record<string, number>;
}

export function summariseUsage(appliances: Appliance[]): UsageSummary {
  let dailyKwh = 0;
  let connectedWatts = 0;
  for (const appliance of appliances) {
    dailyKwh += applianceDailyKwh(appliance);
    connectedWatts += applianceConnectedWatts(appliance);
  }
  const shares: Record<string, number> = {};
  for (const appliance of appliances) {
    shares[appliance.id] = dailyKwh > 0 ? applianceDailyKwh(appliance) / dailyKwh : 0;
  }
  return {
    dailyKwh,
    monthlyKwh: dailyKwh * 30.44,
    annualKwh: dailyKwh * 365,
    connectedWatts,
    shares,
  };
}
