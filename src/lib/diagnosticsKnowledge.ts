export type DiagnosticKey =
  | "Accelerator < 40 %"
  | "Green Band Driving"
  | "Accelerator > 70%"
  | "Engine Stress"
  | "Engine Temp >105°";

export interface DiagnosticKnowledgeEntry {
  key: DiagnosticKey;
  title: string;
  meaning: string;
  thresholds: string[];
  whatItUsuallyIndicates: string[];
  risks: string[];
  recommendationsImmediate: string[];
  recommendationsMaintenance: string[];
  coachingTips: string[];
  synonyms: string[];
}

export const DIAGNOSTICS_KNOWLEDGE: Record<DiagnosticKey, DiagnosticKnowledgeEntry> = {
  "Accelerator < 40 %": {
    key: "Accelerator < 40 %",
    title: "Accelerator < 40 % (recommended)",
    meaning:
      "Accelerator pedal position below 40% typically indicates moderate, smooth throttle use during normal driving. Many eco-driving programs treat this as a recommended behaviour for fuel efficiency, smoother ride, and reduced drivetrain stress.",
    thresholds: [
      "Accelerator pedal position < 40% during acceleration/cruising (eco-driving target).",
    ],
    whatItUsuallyIndicates: [
      "Driver is avoiding aggressive acceleration and maintaining steadier power request.",
      "Better momentum management and fewer large throttle transients.",
    ],
    risks: [
      "Very low throttle can be normal; by itself it is not a fault code.",
      "If performance feels weak even with higher throttle, that may indicate a separate mechanical issue (restricted air/fuel/exhaust, sensor errors, or derate).",
    ],
    recommendationsImmediate: [
      "Encourage steady throttle input, anticipate traffic, and avoid rapid pedal spikes.",
      "Use cruise control where safe/appropriate to reduce micro-accelerations.",
    ],
    recommendationsMaintenance: [
      "If the vehicle lacks power despite higher throttle, inspect for air intake restrictions, exhaust restriction, MAF/MAP issues, and active derate conditions.",
    ],
    coachingTips: [
      "Coach drivers to accelerate progressively and keep throttle below 40% where traffic/load allow.",
      "Track this alongside speeding, idling, harsh accel/brake for a full eco-driving picture.",
    ],
    synonyms: [
      "low throttle",
      "moderate throttle",
      "gentle acceleration",
      "smooth acceleration",
    ],
  },

  "Green Band Driving": {
    key: "Green Band Driving",
    title: "Green Band Driving",
    meaning:
      "Operating the engine within its most fuel‑efficient RPM range (the “green band”). This range differs by engine/vehicle; for your fleet we treat it as 1000–1800 RPM.",
    thresholds: [
      "Engine RPM between 1000 and 1800 RPM (fleet definition).",
    ],
    whatItUsuallyIndicates: [
      "Driver is keeping the engine in an efficient operating band for the current gear/load.",
      "Typically correlates with improved fuel economy and reduced engine wear from over-revving.",
    ],
    risks: [
      "If the driver stays in green band but the vehicle is lugging (high load at very low RPM), it can still stress the engine—gear choice matters.",
      "Very low RPM under heavy load can increase cylinder pressures and temperatures (lugging).",
    ],
    recommendationsImmediate: [
      "Maintain RPM in 1000–1800 where possible; downshift earlier on hills/heavy load to avoid lugging.",
      "Use momentum and avoid unnecessary speed changes; on highways, use cruise control if safe/appropriate.",
    ],
    recommendationsMaintenance: [
      "If green-band time is low fleet-wide, review gearing/route profile and ensure drivers understand shift strategy (manual) or mode selection (automatic).",
    ],
    coachingTips: [
      "Coach: keep revs in the green band at cruise; avoid prolonged high RPM and avoid lugging at low RPM/high load.",
      "Use the percentage metric as a coaching KPI (higher is generally better, within context).",
    ],
    synonyms: [
      "efficient rpm",
      "greenband",
      "optimal rpm band",
    ],
  },

  "Accelerator > 70%": {
    key: "Accelerator > 70%",
    title: "Accelerator > 70%",
    meaning:
      "Accelerator pedal position above 70% typically indicates high throttle demand (“heavy foot”), requesting substantial engine power. It can be necessary for overtaking or climbing grades but sustained usage often indicates aggressive driving and higher fuel consumption.",
    thresholds: [
      "Accelerator pedal position > 70% (high throttle).",
    ],
    whatItUsuallyIndicates: [
      "Aggressive acceleration events or frequent high power demand.",
      "Potential mismatch between gear choice/load and desired speed (e.g., staying in too high a gear).",
    ],
    risks: [
      "Increased fuel consumption and higher drivetrain temperatures (engine, transmission).",
      "Higher wear on engine and transmission components if sustained.",
    ],
    recommendationsImmediate: [
      "Reduce unnecessary full-throttle events; accelerate progressively.",
      "On grades or heavy loads, choose a gear that keeps RPM in a healthy range rather than flooring the pedal at low RPM.",
    ],
    recommendationsMaintenance: [
      "If high throttle is frequent without corresponding speed increase, inspect for restricted air intake/exhaust, turbo/boost issues, fuel delivery problems, or derate conditions.",
    ],
    coachingTips: [
      "Coach drivers to plan overtakes early, keep safe following distances, and avoid racing between stops.",
      "Use scorecards: high throttle %, harsh accel, and speeding often co-occur.",
    ],
    synonyms: [
      "heavy foot",
      "full throttle",
      "wide open throttle",
      "WOT",
    ],
  },

  "Engine Stress": {
    key: "Engine Stress",
    title: "Engine Stress (Torque > 85%)",
    meaning:
      "Engine Stress here means the engine is operating at high torque output for the given conditions. For your fleet definition: engine torque > 85% indicates high load demand.",
    thresholds: [
      "Engine torque > 85% (fleet definition).",
    ],
    whatItUsuallyIndicates: [
      "Heavy load, steep grades, towing, or frequent hard acceleration.",
      "Potential lugging if torque is high while RPM is low in a high gear.",
    ],
    risks: [
      "Elevated thermal load (coolant/oil/EGT) and increased wear if sustained.",
      "Lugging risk: high load at low RPM can overstress pistons/bearings even without obvious overheating.",
    ],
    recommendationsImmediate: [
      "If sustained high torque: reduce load/speed where safe; downshift to raise RPM and reduce lugging.",
      "Monitor temperatures (coolant/oil) and avoid prolonged WOT on hot days or steep grades.",
    ],
    recommendationsMaintenance: [
      "If repeated high torque coincides with poor performance: check intake/exhaust restrictions, sensor readings (MAF/MAP), boost leaks, and any ECM derate triggers.",
      "Consider driver training for gear selection and speed policy on grades.",
    ],
    coachingTips: [
      "Teach: do not ‘floor it’ in a high gear at low RPM—downshift earlier.",
      "Use trends: engine stress events vs route grade and payload to set realistic thresholds.",
    ],
    synonyms: [
      "high torque",
      "high load",
      "engine load",
      "lugging",
    ],
  },

  "Engine Temp >105°": {
    key: "Engine Temp >105°",
    title: "Engine Temp >105° (105°C)",
    meaning:
      "Engine coolant temperature above 105°C is an overheating-risk condition. It can trigger protection/derate and, if sustained, may cause severe engine damage.",
    thresholds: [
      "Engine coolant temperature > 105°C (fleet definition).",
    ],
    whatItUsuallyIndicates: [
      "Cooling system is unable to reject heat under current load/ambient conditions.",
      "Could be caused by low coolant, airflow restriction, fan/thermostat/water pump problems, or extreme operating conditions (heavy load, grades, high ambient temp).",
    ],
    risks: [
      "Head gasket failure, warped head, coolant loss, and escalating derate/limp mode.",
      "Continuing to drive while overheating can cause catastrophic damage.",
    ],
    recommendationsImmediate: [
      "Reduce load immediately: ease off throttle, turn off A/C if safe, and seek a safe place to stop.",
      "If temperature continues to rise: stop and allow engine to cool. Do not open radiator cap while hot.",
      "Escalate to maintenance if overheating repeats or coolant level drops.",
    ],
    recommendationsMaintenance: [
      "Inspect coolant level/leaks, radiator blockage (fins/debris), thermostat, fan clutch/e-fan operation, water pump, and air pockets after service.",
      "Check for signs of coolant contamination (oil in coolant / white smoke) indicating possible head gasket issues.",
    ],
    coachingTips: [
      "Coach drivers on early warning signs and to report overheating immediately—do not ‘push through’ a high temp event.",
    ],
    synonyms: [
      "overheating",
      "coolant over temp",
      "high coolant temperature",
    ],
  },
};

export const DIAGNOSTIC_KEYS: DiagnosticKey[] = Object.keys(DIAGNOSTICS_KNOWLEDGE) as DiagnosticKey[];

export function detectDiagnosticKey(text: string): DiagnosticKey | null {
  const q = String(text ?? "").toLowerCase();
  if (!q.trim()) return null;

  // Prefer exact label matches first.
  for (const key of DIAGNOSTIC_KEYS) {
    if (q.includes(key.toLowerCase())) return key;
  }

  // Then synonyms.
  for (const key of DIAGNOSTIC_KEYS) {
    const entry = DIAGNOSTICS_KNOWLEDGE[key];
    if (entry.synonyms.some((s) => q.includes(s.toLowerCase()))) return key;
  }

  // Heuristic: interpret common phrases.
  if (q.includes("green band") || q.includes("greenband") || q.includes("rpm band")) return "Green Band Driving";
  if (q.includes("overheat") || q.includes("coolant") || q.includes("temperature")) return "Engine Temp >105°";
  if (q.includes("torque") || q.includes("engine stress") || q.includes("high load") || q.includes("lugging")) return "Engine Stress";
  if (q.includes("accelerator") || q.includes("throttle")) {
    if (q.includes("70")) return "Accelerator > 70%";
    if (q.includes("40")) return "Accelerator < 40 %";
  }
  return null;
}

