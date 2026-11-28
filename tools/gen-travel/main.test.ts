import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { generateTravel } from "./main";

const VENDOR_DIR = "vendor/shortest-path-forever";

it("maps the vendored Shortest Path Forever data", async () => {
  const data = await generateTravel(VENDOR_DIR);
  const taxiSource = readFileSync(join(VENDOR_DIR, "Taxi.lua"), "utf8");
  const continents = new Set([0, 1]);
  for (const match of taxiSource.matchAll(/\bmap = (\d+)/g)) continents.add(Number(match[1]));

  expect(data.source.build).toBe("1.60.1.71139");
  expect(data.source.name).toBe("Shortest Path Forever");
  expect(data.source.verifiedOn).toBe("2026-11-27");
  expect(data.source.expiresOn).toBe("2026-12-27");
  expect(data.taxiNodes.length).toBeGreaterThanOrEqual(60);
  expect(data.taxiEdges.length).toBeGreaterThan(0);
  expect(data.transports.length).toBeGreaterThan(0);
  expect(data.taxiEdges.every((edge) => edge.seconds > 0)).toBe(true);
  expect(data.transports.every((leg) => leg.seconds > 0 && leg.periodSec > 0)).toBe(true);
  expect(data.taxiNodes.every((node) => continents.has(node.pos.continent))).toBe(true);
  const nodeIds = new Set(data.taxiNodes.map((node) => node.id));
  expect(data.taxiEdges.every((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to))).toBe(true);
});

it("derives faction and directed boat legs", async () => {
  const data = await generateTravel(VENDOR_DIR);
  expect(data.taxiNodes.find((node) => node.id === 2)?.faction).toBe("A");
  expect(data.taxiNodes.find((node) => node.id === 11)?.faction).toBe("H");
  const crossContinent = data.transports.filter((leg) => leg.fromDock.continent !== leg.toDock.continent);
  expect(crossContinent.length).toBeGreaterThan(0);
});

it("imports the Darnassus and Rut'theran teleporters and drops lifts and falls", async () => {
  const data = await generateTravel(VENDOR_DIR);
  const darnassus = { continent: 1, x: 9947.5, y: 2630 };
  const rutheran = { continent: 1, x: 8785.8, y: 967 };
  const toRutheran = data.portals.find((portal) => portal.from.x === darnassus.x && portal.from.y === darnassus.y);
  expect(toRutheran?.to).toEqual(rutheran);
  expect(data.portals.some((portal) => portal.to.x === 9946.3 && portal.to.y === 2613)).toBe(true);
  for (const portal of data.portals) {
    expect(portal.from.continent).toBe(portal.to.continent);
    expect(Math.hypot(portal.from.x - portal.to.x, portal.from.y - portal.to.y)).toBeGreaterThan(200);
  }
  const stormwind = data.portals.filter((portal) => portal.from.continent === 0 && Math.abs(portal.from.x + 9020) < 50 && Math.abs(portal.from.y - 885) < 50);
  expect(stormwind).toEqual([]);
  expect(data.portals.some((portal) => portal.to.x === -5191.3 && portal.to.y === -2802.6)).toBe(false);
});

it("dates the portal and walk sources", async () => {
  const data = await generateTravel(VENDOR_DIR);
  expect(data.source.cmangosCommit).toBe("64adf9f62008df8d530e5d88e3c89aa85e42dc38");
  expect(data.source.wagoBuild).toBe("1.60.1.71139");
});

it("imports Shortest Path Forever's baked walks between the places we model", async () => {
  const data = await generateTravel(VENDOR_DIR);
  const placeAt = (p: { continent: number; x: number; y: number }) =>
    data.walkPlaces.findIndex((q) => q.continent === p.continent && q.x === p.x && q.y === p.y);
  const taxiPlace = (id: number) => {
    const node = data.taxiNodes.find((candidate) => candidate.id === id);
    if (node == null) throw new Error(`no taxi ${id}`);
    return placeAt(node.pos);
  };
  const yards = (a: number, b: number): number | null => {
    for (let i = 0; i < data.walks.length; i += 4) {
      if (data.walks[i] === a && data.walks[i + 1] === b) return data.walks[i + 2];
      if (data.walks[i] === b && data.walks[i + 1] === a) return data.walks[i + 3];
    }
    return null;
  };

  expect(data.source.commit).toBe("3f7008ec66f5455295283588ddf6de80ff4991a7");
  expect(data.taxiNodes.every((node) => placeAt(node.pos) >= 0)).toBe(true);
  expect(yards(taxiPlace(3242), taxiPlace(65))).toBe(6413);
  expect(yards(taxiPlace(65), taxiPlace(3242))).toBe(7415);
  expect(yards(taxiPlace(22), taxiPlace(77))).toBeNull();
  const stormwindTram = placeAt({ continent: 0, x: -8346.5, y: 514 });
  expect(stormwindTram).toBeGreaterThanOrEqual(0);
  expect(yards(stormwindTram, taxiPlace(2))).toBe(781);
  expect(yards(taxiPlace(2), stormwindTram)).toBe(809);
  expect(data.walks.length % 4).toBe(0);
  expect(data.walks.every((value) => Number.isInteger(value) && value >= -1)).toBe(true);
});

it("takes Shortest Path Forever's portals and keeps only those between modelled maps", async () => {
  const data = await generateTravel(VENDOR_DIR);
  expect(data.portals.map((portal) => portal.name).sort()).toEqual(["Portal to Darnassus", "Portal to Rut'theran Village"]);
});
