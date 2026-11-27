import { createArrow, playerPosition, type ArrowApi, type ArrowTarget } from "./arrow/arrowFrame";
import { t } from "./core/l10n";
import { guard, isDisabled, reportOnce } from "./core/report";
import { loadCharDb, type CharDb } from "./core/storage";
import { TRAVEL } from "./data/generated/travel";
import { createQuestRepository, type QuestInfo, type QuestRepository, type RepoResult } from "./data/questRepository";
import { createCommands } from "./game/commands";
import { createEngine, describeTarget, sameKey, targetQuest, type Engine } from "./game/engine";
import { createPlayerState, HEARTHSTONE_SPELL_ID, playerFaction, type PlayerStateReader } from "./game/playerState";
import { createPlaceFor, createPositions, mapToWorld, uiMapToWorld } from "./game/positions";
import { createRouting } from "./game/routing";
import { installMapPins } from "./map/pins";
import { installPinButtons } from "./questlog/pinButtons";
import { createRouteFollower, type RouteFollower } from "./route/follower";
import { installAutoFly } from "./taxi/autoFly";
import { createUi } from "./ui/ui";

_G.MinMaxQuest = { version: "0.1.0" };

const TICK_SEC = 0.5;
const FORCING_EVENTS = [
  "PLAYER_ENTERING_WORLD",
  "QUEST_ACCEPTED",
  "QUEST_TURNED_IN",
  "ZONE_CHANGED_NEW_AREA",
  "PLAYER_LEVEL_UP",
];
const EVENTS = ["PLAYER_LOGIN", "QUEST_LOG_UPDATE", "HEARTHSTONE_BOUND", "PLAYER_REGEN_ENABLED", ...FORCING_EVENTS];

interface Game {
  engine: Engine;
  player: PlayerStateReader;
  repo: QuestRepository;
  follower: RouteFollower;
  quests(): QuestInfo[];
  refreshPins(): void;
}

let db: CharDb | null = null;

function getDb(): CharDb {
  if (db == null) {
    db = loadCharDb(_G.MinMaxQuestCharDB);
    _G.MinMaxQuestCharDB = db;
  }
  return db;
}

let repoResult: RepoResult | null = null;

function getRepository(): QuestRepository | null {
  if (repoResult == null) repoResult = createQuestRepository(_G.LibQuestieDB as LibQuestieDBApi | null);
  if (!repoResult.ok) {
    reportOnce("repository", `${t("questieMissing")} (${repoResult.message})`);
    return null;
  }
  return repoResult.repo;
}

let arrow: ArrowApi | null = null;

function getArrow(): ArrowApi {
  if (arrow == null) arrow = createArrow(getDb());
  return arrow;
}

let game: Game | null = null;
let shownArrow: ArrowTarget | null = null;
// Events only raise flags; the ticker runs at most one refresh per tick.
let forcePending = true;
let logDirty = true;
let lastMode: CharDb["activeMode"] | null = null;

function syncArrow(): void {
  if (game == null) return;
  const next = UnitOnTaxi("player") === true ? null : game.engine.arrowTarget();
  if (next === shownArrow) return;
  shownArrow = next;
  guard("arrow", () => getArrow().setTarget(next));
}

function clearArrow(): void {
  if (shownArrow == null) return;
  shownArrow = null;
  guard("arrow", () => getArrow().setTarget(null));
}

const ui = createUi({ db: () => getDb(), game: () => start() });

const commands = createCommands({
  repository: () => getRepository(),
  arrow: () => getArrow(),
  game: () => start(),
  toggleWindow: () => ui.toggle(),
});

function tick(current: Game): void {
  if (logDirty) {
    logDirty = false;
    if (current.player.refreshLog()) forcePending = true;
  }
  const mode = getDb().activeMode;
  const force = forcePending || mode !== lastMode;
  lastMode = mode;
  forcePending = false;
  current.engine.refreshTargets(force);
  syncArrow();
}

function start(): Game | null {
  if (game != null) return game;
  const repo = getRepository();
  if (repo == null) return null;
  const charDb = getDb();
  const player = createPlayerState(_G.LibQuestieDB as LibQuestieDBApi, charDb);
  const routing = createRouting(repo, charDb, createPositions(repo, mapToWorld(repo), () => playerFaction()));
  const follower = createRouteFollower({
    db: charDb,
    faction: () => playerFaction(),
    quest: (id) => repo.get(id),
    toWorld: (uiMapId, x, y) => uiMapToWorld(uiMapId, x, y),
    place: createPlaceFor(repo, () => playerFaction()),
    timeTo: (snap) => routing.timeTo(snap),
    inCombat: () => InCombatLockdown(),
    taxiNodes: TRAVEL.taxiNodes,
  });
  const engine = createEngine(
    {
      now: () => GetTime(),
      readPlayer: () => player.read(),
      readPosition: () => playerPosition(),
      completion: (snap) => routing.completion(snap),
      // A failing route disables itself once; the engine then falls back to completion.
      route: (snap) => guard("route", () => follower.targets(snap)) ?? null,
      firstHop: (target) => routing.firstHop(target),
      getQuest: (id) => repo.get(id),
      allQuests: () => routing.quests(),
      onTargets: (_list, current) => {
        commands.targetChanged(current);
        syncArrow();
      },
      onTaxi: () => UnitOnTaxi("player") === true,
      clockMs: () => debugprofilestop(),
    },
    charDb,
  );
  const mapPins = guard("mapPins", () =>
    installMapPins({
      db: charDb,
      label: (target) => describeTarget(target, targetQuest(target, (id) => repo.get(id))),
      getPins: () => {
        const current = engine.current();
        const next = engine.targets().find((target) => !sameKey(target, current)) ?? null;
        return { current, next };
      },
    }),
  );
  if (mapPins != null) engine.onChange(() => mapPins.refresh());
  const started: Game = {
    engine,
    player,
    repo,
    follower,
    quests: () => routing.quests(),
    refreshPins: () => mapPins?.refresh(),
  };
  game = started;
  const refreshPins = guard("pinButtons", () =>
    installPinButtons(
      (id) => engine.pin(charDb.pinnedQuestId === id ? null : id),
      (id) => charDb.pinnedQuestId === id,
    ),
  );
  if (refreshPins != null) engine.onChange(() => refreshPins());
  guard("autoFly", () =>
    installAutoFly({
      db: charDb,
      refresh: () => engine.refreshTargets(true),
      currentLeg: () => {
        const target = engine.current();
        return target == null ? null : (follower.taxiLeg(target) ?? routing.taxiLeg(target));
      },
    }),
  );
  C_Timer.NewTicker(TICK_SEC, () => {
    guard("engine", () => tick(started));
    if (isDisabled("engine")) clearArrow();
  });
  return started;
}

function onEvent(event: string, arg1: unknown, arg3: unknown): void {
  if (event === "PLAYER_LOGIN") {
    start();
    return;
  }
  const current = game;
  if (current == null) return;
  const { player } = current;
  if (event === "UNIT_SPELLCAST_SUCCEEDED") {
    if (arg3 === HEARTHSTONE_SPELL_ID) player.hearthCast();
  } else if (event === "HEARTHSTONE_BOUND") {
    player.hearthBound();
    current.follower.hearthBound();
    forcePending = true;
  } else if (event === "PLAYER_REGEN_ENABLED") {
    forcePending = true;
  } else if (event === "QUEST_LOG_UPDATE") {
    logDirty = true;
  } else if (FORCING_EVENTS.includes(event)) {
    forcePending = true;
    if (event === "PLAYER_ENTERING_WORLD") {
      player.enteredWorld();
      player.markCompletedDirty();
      logDirty = true;
    } else if (event === "QUEST_TURNED_IN") {
      if (typeof arg1 === "number") player.markTurnedIn(arg1);
      else player.markCompletedDirty();
      logDirty = true;
    } else if (event === "QUEST_ACCEPTED") {
      logDirty = true;
    } else if (event === "PLAYER_LEVEL_UP" && typeof arg1 === "number") {
      player.levelUp(arg1);
    }
  }
}

const events = CreateFrame("Frame", "MinMaxQuestEvents", UIParent);
for (const event of EVENTS) events.RegisterEvent(event);
events.RegisterUnitEvent("UNIT_SPELLCAST_SUCCEEDED", "player");
events.SetScript("OnEvent", (_frame, event, arg1, _arg2, arg3) => {
  guard("engine", () => onEvent(event, arg1, arg3));
});

_G.SLASH_MMQ1 = "/mmq";
SlashCmdList["MMQ"] = (message: string) => commands.handle(message);
