// Builds a synthetic multi-team milestone through the real analysis code, so
// the fixture is guaranteed to match the backend's contract and semantics.
//   bun mac/scripts/generate-milestone-fixtures.ts
import { analyzeMilestone, type EpicInput, type ItemInput } from "../../lib/milestoneAnalysis.ts";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const out = process.argv[2] ?? join(import.meta.dir, "../BetterTaskManager/BetterTaskManagerTests/Fixtures");
const st = (c: "new" | "indeterminate" | "done") => ({
  name: c === "new" ? "To Do" : c === "indeterminate" ? "In Progress" : "Done",
  category: c,
});
const ref = (key: string, summary: string, c: "new" | "indeterminate" | "done" = "new") => ({ key, summary, status: st(c) });

const increments = [
  { key: "LAD-20", summary: "Project pricing · B2B Project", status: st("indeterminate"), team: null,
    capabilities: [ref("LA-41", "Project quotes & price agreements")],
    teamEpics: [ref("CHK-10", "Quote-based checkout"), ref("PLT-5", "Price agreement service")],
    blocks: ["LAD-21"], blockedBy: [] },
  { key: "LAD-21", summary: "Split deliveries · B2B Project", status: st("indeterminate"), team: null,
    capabilities: [ref("LA-30", "Foundational Shipment Orchestration")],
    teamEpics: [ref("AS-500", "Multi-drop shipment planning"), ref("FUL-12", "Warehouse wave picking for projects")],
    blocks: [], blockedBy: ["LAD-20"] },
  { key: "LAD-22", summary: "Project order tracking · B2B Project", status: st("new"), team: null,
    capabilities: [ref("LA-33", "Order Management"), ref("LA-52", "Customer self-service")],
    teamEpics: [ref("AS-510", "Project order timeline"), ref("CHK-14", "My projects page")],
    blocks: [], blockedBy: [] },
  { key: "LAD-23", summary: "Invoicing per site · B2B Project", status: st("new"), team: null,
    capabilities: [ref("LA-60", "B2B invoicing")], teamEpics: [], blocks: [], blockedBy: [] },
];

const epics: EpicInput[] = [
  { key: "PLT-5", summary: "Price agreement service", status: st("indeterminate"), team: "Platform", projectKey: "PLT", assignee: "Mia Holm", incrementKeys: ["LAD-20"], blocks: [] },
  { key: "CHK-10", summary: "Quote-based checkout", status: st("indeterminate"), team: "Checkout", projectKey: "CHK", assignee: "Jonas Berg", incrementKeys: ["LAD-20"], blocks: [] },
  { key: "AS-500", summary: "Multi-drop shipment planning", status: st("indeterminate"), team: "Aftersales", projectKey: "AS", assignee: "Emil Thaudal Bønnerup", incrementKeys: ["LAD-21"], blocks: [] },
  { key: "FUL-12", summary: "Warehouse wave picking for projects", status: st("new"), team: "Fulfilment", projectKey: "FUL", assignee: null, incrementKeys: ["LAD-21"], blocks: [] },
  { key: "AS-510", summary: "Project order timeline", status: st("new"), team: "Aftersales", projectKey: "AS", assignee: null, incrementKeys: ["LAD-22"], blocks: [] },
  { key: "CHK-14", summary: "My projects page", status: st("new"), team: "Checkout", projectKey: "CHK", assignee: null, incrementKeys: ["LAD-22"], blocks: ["AS-510"] },
];

type Row = [key: string, summary: string, epic: string, c: "new" | "indeterminate" | "done", assignee: string | null, blocks: string[]];
const team = (k: string) => ({ PLT: "Platform", CHK: "Checkout", AS: "Aftersales", FUL: "Fulfilment", EXT: "Finance" })[k.split("-")[0]]!;
const rows: Row[] = [
  ["PLT-6", "Price agreement data model", "PLT-5", "done", "Mia Holm", ["PLT-7", "PLT-8"]],
  ["PLT-7", "Agreement CRUD API", "PLT-5", "indeterminate", "Mia Holm", ["PLT-9", "CHK-11"]],
  ["PLT-8", "Agreement import from ERP", "PLT-5", "new", null, ["PLT-9"]],
  ["PLT-9", "Price resolution endpoint", "PLT-5", "new", "Ola Nord", ["CHK-12", "AS-502"]],
  ["PLT-15", "Agreement audit log", "PLT-5", "new", null, []],
  ["CHK-11", "Quote cart state", "CHK-10", "indeterminate", "Jonas Berg", ["CHK-12"]],
  ["CHK-12", "Apply agreement prices in cart", "CHK-10", "new", "Jonas Berg", ["CHK-13"]],
  ["CHK-13", "Quote checkout confirmation", "CHK-10", "new", null, ["AS-503", "FUL-14"]],
  ["CHK-16", "Quote PDF export", "CHK-10", "new", "Sara Lind", []],
  ["AS-501", "Multi-drop address model", "AS-500", "done", "Emil Thaudal Bønnerup", ["AS-502"]],
  ["AS-502", "Split order lines by delivery site", "AS-500", "indeterminate", "Emil Thaudal Bønnerup", ["AS-503"]],
  ["AS-503", "Shipment grouping per drop", "AS-500", "new", "Emil Thaudal Bønnerup", ["AS-504", "FUL-15"]],
  ["AS-504", "Carrier booking per drop", "AS-500", "new", null, ["AS-505"]],
  ["AS-505", "Delivery notifications per site", "AS-500", "new", "Kim Dahl", []],
  ["AS-506", "Drop-level tracking events", "AS-500", "new", "Kim Dahl", ["AS-511"]],
  ["FUL-13", "Wave template for projects", "FUL-12", "done", "Lars Vik", ["FUL-14"]],
  ["FUL-14", "Reserve stock per project wave", "FUL-12", "new", "Lars Vik", ["FUL-15"]],
  ["FUL-15", "Pick lists per delivery drop", "FUL-12", "new", null, ["FUL-16"]],
  ["FUL-16", "Pack & label per drop", "FUL-12", "new", null, ["AS-505"]],
  ["FUL-17", "Wave capacity dashboard", "FUL-12", "new", "Lars Vik", []],
  ["AS-511", "Timeline read model", "AS-510", "new", null, ["AS-512"]],
  ["AS-512", "Timeline API", "AS-510", "new", null, []],
  ["CHK-15", "Projects list page", "CHK-14", "new", "Sara Lind", []],
  ["EXT-90", "Finance: credit limit per project", "", "indeterminate", "Per Ek", ["CHK-13"]],
];
const items: ItemInput[] = rows.map(([key, summary, epic, c, assignee, blocks]) => ({
  key, summary, type: key.startsWith("PLT") ? "Task" : "Story", status: st(c), assignee,
  epicKey: epic || null, team: team(key), points: null, external: key.startsWith("EXT"), blocks,
}));

const r = analyzeMilestone({ increments, epics, items });
const release = { id: "10141", name: "B2B Project", description: "Project customers: quotes, split deliveries, tracking", released: false, archived: false, startDate: "2026-09-01", releaseDate: "2026-12-15", overdue: false, sequence: 1 };
const now = new Date().toISOString();
const detail = { project: { key: "LAD", name: "Logistics Accelerator - Delivery" }, release, ...r, generatedAt: now };

const progressOf = (cs: string[]) => ({ done: cs.filter((c) => c === "done").length, inProgress: cs.filter((c) => c === "indeterminate").length, todo: cs.filter((c) => c === "new").length, total: cs.length });
const summary = (i: (typeof r.increments)[number]) => ({ key: i.key, summary: i.summary, status: i.status, team: i.team, capabilities: i.capabilities, teamEpics: i.teamEpics, blocks: i.blocks, blockedBy: i.blockedBy });
const programRelease = (rel: typeof release, incs: typeof r.increments) => ({
  ...rel, increments: incs.map(summary),
  progress: progressOf(incs.map((i) => i.status.category)),
  epicProgress: progressOf(incs.flatMap((i) => i.teamEpics.map((e) => e.status.category))),
});
const empty = (id: string, name: string, seq: number, date: string | null) => ({ id, name, description: null, released: false, archived: false, startDate: null, releaseDate: date, overdue: false, sequence: seq, increments: [], progress: progressOf([]), epicProgress: progressOf([]) });
const wholesale = { ...empty("10140", "B2B Wholesale", 0, "2026-08-29"), overdue: true,
  increments: [summary({ ...r.increments[0], key: "LAD-1", summary: "Shipment Orchestration · B2B Wholesale", status: st("done"), blocks: [], blockedBy: [] }),
               summary({ ...r.increments[2], key: "LAD-2", summary: "Order Orchestration & Operations · B2B Wholesale", status: st("indeterminate"), blocks: [], blockedBy: [] })],
  progress: progressOf(["done", "indeterminate"]), epicProgress: progressOf(["done", "done", "done", "indeterminate"]) };
const program = {
  project: detail.project,
  releases: [wholesale, programRelease(release, r.increments),
    { ...empty("10142", "B2C Low Volume", 2, "2027-03-01"), increments: [summary({ ...r.increments[3], key: "LAD-30", summary: "Consumer checkout · B2C Low Volume", blocks: [], blockedBy: ["LAD-22"] })], progress: progressOf(["new"]) },
    empty("10143", "B2C High Volume", 3, null), empty("10144", "FT Shops", 4, null)],
  unscheduled: [summary({ ...r.increments[3], key: "LAD-40", summary: "Returns portal", blocks: [], blockedBy: [] })],
  warnings: [{ kind: "out-of-order-dependency", message: "LAD-30 (B2C Low Volume) is blocked by LAD-22, which ships in a later-or-same milestone.", keys: ["LAD-30", "LAD-22"] }],
  generatedAt: now,
};

// A deterministic stress milestone: six teams, ~340 items and a dense blocking
// graph, for measuring swimlane layout and scrolling at realistic program scale.
let seed = 42;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
const bigTeams = [["PLT", "Platform"], ["CHK", "Checkout"], ["AS", "Aftersales"], ["FUL", "Fulfilment"], ["PAY", "Payments"], ["SRCH", "Search"]] as const;
const people = ["Mia Holm", "Jonas Berg", "Sara Lind", "Kim Dahl", "Lars Vik", "Ola Nord", "Per Ek", "Ida Sand", null];
const verbs = ["Model", "API for", "Import of", "UI for", "Events for", "Migration of", "Validation of", "Reporting on", "Sync of", "Caching of"];
const nouns = ["price agreements", "delivery drops", "quote carts", "wave picks", "payment terms", "search facets", "invoices", "carrier bookings", "stock reservations", "order lines", "customer sites", "return labels"];
const bigIncrements = Array.from({ length: 8 }, (_, i) => ({
  key: `LAD-${100 + i}`, summary: `${pick(nouns)} · Stress`, status: st(i < 2 ? "indeterminate" : "new"), team: null,
  capabilities: [ref(`LA-${200 + i}`, `Capability ${i + 1}`)], teamEpics: [] as ReturnType<typeof ref>[],
  blocks: i < 7 && rand() < 0.5 ? [`LAD-${101 + i}`] : [], blockedBy: [] as string[],
}));
for (const inc of bigIncrements) for (const b of inc.blocks) bigIncrements.find((x) => x.key === b)!.blockedBy.push(inc.key);
const bigEpics: EpicInput[] = [];
const bigItems: ItemInput[] = [];
let order = 0;
bigTeams.forEach(([prefix, name], t) => {
  for (let e = 0; e < 4; e++) {
    const epicKey = `${prefix}-${1000 + e}`;
    const inc = bigIncrements[(t + e * 2) % bigIncrements.length];
    inc.teamEpics.push(ref(epicKey, `${name} ${pick(nouns)}`));
    bigEpics.push({ key: epicKey, summary: `${name} ${pick(nouns)}`, status: st(e === 0 ? "indeterminate" : "new"), team: name, projectKey: prefix, assignee: pick(people), incrementKeys: [inc.key], blocks: [] });
    const count = 12 + Math.floor(rand() * 4);
    for (let n = 0; n < count; n++) {
      const c = rand() < 0.15 ? "done" : rand() < 0.25 ? "indeterminate" : "new";
      bigItems.push({ key: `${prefix}-${1100 + e * 40 + n}`, summary: `${pick(verbs)} ${pick(nouns)}`, type: "Story", status: st(c), assignee: pick(people), epicKey, team: name, points: null, external: false, blocks: [], order: order++ } as ItemInput & { order: number });
    }
  }
});
// Edges only run from earlier-generated to later items (a DAG); most stay within the
// team, roughly a third cross teams, so the critical path hops lanes realistically.
const ranked = [...bigItems].sort(() => rand() - 0.5).map((item, i) => ({ item, rank: i }));
for (const { item, rank } of ranked) {
  const fanOut = rand() < 0.55 ? 1 + Math.floor(rand() * 2) : 0;
  for (let k = 0; k < fanOut; k++) {
    const sameTeam = rand() < 0.65;
    const candidates = ranked.filter((r) => r.rank > rank && r.rank < rank + 40 && (r.item.team === item.team) === sameTeam);
    if (candidates.length) {
      const target = pick(candidates).item.key;
      if (!item.blocks.includes(target)) item.blocks.push(target);
    }
  }
}
const big = analyzeMilestone({ increments: bigIncrements, epics: bigEpics, items: bigItems.map(({ order: _, ...rest }: any) => rest) });
const bigRelease = { id: "10145", name: "Stress Test", description: "Synthetic six-team milestone for performance work", released: false, archived: false, startDate: null, releaseDate: "2027-06-01", overdue: false, sequence: 5 };
const bigDetail = { project: detail.project, release: bigRelease, ...big, generatedAt: now };
program.releases.push(programRelease(bigRelease, big.increments) as any);

mkdirSync(out, { recursive: true });
writeFileSync(`${out}/milestone-detail-large.json`, JSON.stringify(bigDetail));
console.log("large:", big.items.length, "items", big.dependencies.length, "deps, path", big.criticalPath.length);
writeFileSync(`${out}/milestone-detail-multiteam.json`, JSON.stringify(detail, null, 2));
writeFileSync(`${out}/program-overview-multi.json`, JSON.stringify(program, null, 2));
console.log("critical path", r.criticalPath, "teams", r.teams.map((t) => t.name), "warnings", r.warnings.map((w) => w.kind));
