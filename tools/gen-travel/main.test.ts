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

it("dates the portal sources", async () => {
  const data = await generateTravel(VENDOR_DIR);
  expect(data.source.cmangosCommit).toBe("64adf9f62008df8d530e5d88e3c89aa85e42dc38");
  expect(data.source.wagoBuild).toBe("1.60.1.71139");
});
