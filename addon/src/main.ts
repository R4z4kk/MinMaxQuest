import { createArrow, playerPosition, type ArrowApi, type ArrowTarget } from "./arrow/arrowFrame";
import { corpseTarget, type CorpseDeps } from "./arrow/corpse";
import { createItemButton, itemUsable, type ItemButtonApi } from "./arrow/itemButton";
import { questItemFor, type ItemDeps } from "./arrow/questItem";
import { applyLanguage, t } from "./core/l10n";
import { guard, isDisabled, reportOnce } from "./core/report";
import { pruneAccessState } from "./access/chains";
import { loadAccountDb, loadCharDb, type AccountDb, type CharDb } from "./core/storage";
import { TRAVEL } from "./data/generated/travel";
import { createQuestRepository, type QuestInfo, type QuestRepository, type RepoResult } from "./data/questRepository";
import { createCommands } from "./game/commands";
import { createEngine, describeTarget, sameKey, targetQuest, type Engine } from "./game/engine";
import { clientItemName, createPlayerState, HEARTHSTONE_SPELL_ID, itemCount, playerFaction, type PlayerStateReader } from "./game/playerState";
import { createPlaceFor, createPositions, mapToWorld, uiMapToWorld, worldToMap } from "./game/positions";
import { clientSpellKnown, createPlanFor, createPlayerSkills, type PlayerSkills } from "./game/professions";
import { createNeighbourFinder, type HbdMapData } from "./game/neighbours";
import { createRouting } from "./game/routing";
import { createHopChooser, createSpf, readSpfApi } from "./game/spf";
import { objectiveLabel } from "./map/farmArea";
import { installMapPins } from "./map/pins";
import { installPinButtons } from "./questlog/pinButtons";
import { createRouteFollower, type RouteFollower } from "./route/follower";
import { installAutoFly, pickTaxiLeg } from "./taxi/autoFly";
import { createUi } from "./ui/ui";

_G.MinMaxQuest = { version: "0.2.0-beta.2" };

const TICK_SEC = 0.5;
const FORCING_EVENTS = [
  "PLAYER_ENTERING_WORLD",
  "QUEST_ACCEPTED",
  "QUEST_TURNED_IN",
  "ZONE_CHANGED_NEW_AREA",
  "PLAYER_LEVEL_UP",
  "PLAYER_DEAD",
  "PLAYER_ALIVE",
  "PLAYER_UNGHOST",
];
const ITEM_EVENTS = ["BAG_UPDATE_DELAYED", "BAG_UPDATE_COOLDOWN"];
const ITEM_INFO_EVENT = "GET_ITEM_INFO_RECEIVED";
const SKILLS_EVENT = "SKILL_LINES_CHANGED";
const EVENTS = ["PLAYER_LOGIN", "QUEST_LOG_UPDATE", ITEM_INFO_EVENT, SKILLS_EVENT, "HEARTHSTONE_BOUND", "PLAYER_REGEN_DISABLED", "PLAYER_REGEN_ENABLED", ...ITEM_EVENTS, ...FORCING_EVENTS];

interface Game {
  engine: Engine;
  player: PlayerStateReader;
  repo: QuestRepository;
  follower: RouteFollower;
  skills: PlayerSkills;
  quests(): QuestInfo[];
  refreshPins(): void;
}

let accountDb: AccountDb | null = null;

function getAccountDb(): AccountDb {
  if (accountDb == null) {
    accountDb = loadAccountDb(_G.MinMaxQuestDB);
    _G.MinMaxQuestDB = accountDb;
    applyLanguage(accountDb.locale);
  }
  return accountDb;
}

let db: CharDb | null = null;

function getDb(): CharDb {
  getAccountDb();
  if (db == null) {
    db = loadCharDb(_G.MinMaxQuestCharDB);
    pruneAccessState(db, playerFaction());
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
let itemButton: ItemButtonApi | null = null;

// The arrow lock also locks the item button.
function getArrow(): ArrowApi {
  if (arrow == null) {
    const created = createArrow(getDb());
    arrow = {
      ...created,
      setLocked: (locked) => {
        if (!locked && (getDb().hidden || !ui.isShown())) setAllHidden(false);
        created.setLocked(locked);
        const button = itemButton;
        if (button != null) guard("itemButton", () => button.setLocked(locked));
      },
    };
  }
  return arrow;
}

// Created once, out of combat: a secure button cannot be created in combat.
function ensureItemButton(): void {
  if (itemButton != null || isDisabled("itemButton") || InCombatLockdown()) return;
  itemButton = guard("itemButton", () => createItemButton(getDb(), () => getArrow().frame));
  syncItem();
}

const itemDeps: ItemDeps = { count: (itemId) => itemCount(itemId), usable: (itemId) => itemUsable(itemId) };

function syncItem(): void {
  const current = game;
  const button = itemButton;
  if (current == null || button == null) return;
  guard("itemButton", () => {
    const questId = current.engine.current()?.questId ?? null;
    button.want(questItemFor(questId == null ? null : current.repo.get(questId), itemDeps));
  });
}

let game: Game | null = null;
let shownArrow: ArrowTarget | null = null;
// Events only raise flags; the ticker runs at most one refresh per tick.
let forcePending = true;
let logDirty = true;
// Item names arrive in bursts: the Access tab redraws once on the next tick.
let itemInfoPending = false;
let lastMode: CharDb["activeMode"] | null = null;

const corpseDeps: CorpseDeps = {
  isDead: () => UnitIsDeadOrGhost("player") === true,
  isGhost: () => UnitIsGhost("player") === true,
  corpseOnMap: (uiMapId) => C_DeathInfo?.GetCorpseMapPosition?.(uiMapId) ?? null,
  playerMap: () => C_Map.GetBestMapForUnit("player"),
  parentMap: (uiMapId) => C_Map.GetMapInfo(uiMapId)?.parentMapID ?? null,
  toWorld: (uiMapId, x, y) => uiMapToWorld(uiMapId, x, y),
};

function currentTarget(current: Game): ArrowTarget | null {
  if (!corpseDeps.isDead()) return current.engine.arrowTarget();
  const corpse = guard("corpseArrow", () => corpseTarget(corpseDeps, t("corpse")));
  if (corpse?.kind === "corpse") return corpse.target;
  if (corpse?.kind === "atBody") return null;
  if (corpse?.kind === "unknown") {
    reportOnce("corpse", t("corpseUnknown"));
    return null;
  }
  return current.engine.arrowTarget();
}

function syncArrow(): void {
  if (game == null) return;
  const next = UnitOnTaxi("player") === true ? null : currentTarget(game);
  if (next === shownArrow) return;
  shownArrow = next;
  guard("arrow", () => getArrow().setTarget(next));
  game.refreshPins();
}

function clearArrow(): void {
  if (shownArrow == null) return;
  shownArrow = null;
  guard("arrow", () => getArrow().setTarget(null));
}

function setAllHidden(hidden: boolean): void {
  getDb().hidden = hidden;
  ui.setShown(!hidden);
  guard("arrow", () => getArrow().setHidden(hidden));
  const button = itemButton;
  if (button != null) guard("itemButton", () => button.setHidden(hidden));
  game?.refreshPins();
}

function toggleAll(): void {
  setAllHidden(!getDb().hidden && ui.isShown());
}

const ui = createUi({ db: () => getDb(), account: () => getAccountDb(), game: () => start(), arrow: () => getArrow(), hideAll: () => setAllHidden(true) });

const commands = createCommands({
  repository: () => getRepository(),
  arrow: () => getArrow(),
  game: () => start(),
  toggleWindow: () => toggleAll(),
});

function tick(current: Game): void {
  if (guard("skills", () => current.skills.refresh()) === true) forcePending = true;
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
  // Objective counts on the farm area label change without a new target.
  if (force) current.refreshPins();
  if (itemInfoPending) {
    itemInfoPending = false;
    ui.refreshAccess();
  }
}

function start(): Game | null {
  if (game != null) return game;
  const repo = getRepository();
  if (repo == null) return null;
  const charDb = getDb();
  const player = createPlayerState(_G.LibQuestieDB as LibQuestieDBApi, charDb);
  const skills = createPlayerSkills(() => {
    const known = clientSpellKnown();
    if (known == null) reportOnce("skills", t("skillsUnknown"));
    return known;
  });
  const planFor = createPlanFor(
    (itemId) => repo.itemSources(itemId),
    () => skills.current(),
    (itemId) => clientItemName(itemId) ?? repo.itemName(itemId),
  );
  const positionsFor = createPositions(repo, mapToWorld(repo), () => playerFaction(), planFor);
  const neighbours = createNeighbourFinder(
    () => (LibStub?.("HereBeDragons-2.0", true) as { mapData: HbdMapData } | null)?.mapData ?? null,
  );
  const routing = createRouting(repo, charDb, positionsFor, TRAVEL, {
    maps: () => neighbours.around(C_Map.GetBestMapForUnit("player")),
    zoneOf: (uiMapId) => neighbours.zoneOf(uiMapId),
  }, planFor);
  const spf = createSpf({
    api: () => readSpfApi(),
    toMap: (pos) => worldToMap(pos),
    report: (reason) => reportOnce("spfReason", t("spfRefused").replace("{reason}", reason)),
  });
  const hopFor = createHopChooser(spf, routing);
  const follower = createRouteFollower({
    db: charDb,
    faction: () => playerFaction(),
    quest: (id) => repo.get(id),
    toWorld: (uiMapId, x, y) => uiMapToWorld(uiMapId, x, y),
    place: createPlaceFor(repo, () => playerFaction(), () => playerPosition(), uiMapToWorld, planFor),
    positionsFor,
    timeTo: (snap) => routing.timeTo(snap),
    inCombat: () => InCombatLockdown(),
    taxiNodes: TRAVEL.taxiNodes,
    planFor,
  });
  const engine = createEngine(
    {
      now: () => GetTime(),
      readPlayer: () => player.read(),
      readPosition: () => playerPosition(),
      completion: (snap) => routing.completion(snap),
      // A failing route disables itself once; the engine then falls back to completion.
      route: (snap) => guard("route", () => follower.targets(snap)) ?? null,
      firstHop: (target) => hopFor(target),
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
      areaLabel: (target) => objectiveLabel(target, targetQuest(target, (id) => repo.get(id)), repo, engine.snapshot()?.log ?? null),
      getPins: () => {
        const target = engine.current();
        const waypoint = target?.kind === "objective" ? engine.waypoint() : null;
        const current = target != null && waypoint != null ? { ...target, pos: waypoint } : target;
        const next = engine.targets().find((other) => other.pos != null && !sameKey(other, target)) ?? null;
        return { current, next };
      },
    }),
  );
  if (mapPins != null) engine.onChange(() => mapPins.refresh());
  engine.onChange(() => syncItem());
  const started: Game = {
    engine,
    player,
    repo,
    follower,
    skills,
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
        if (target == null) return null;
        const goal = follower.flyGoal(target);
        return pickTaxiLeg(follower.taxiLeg(target), goal == null ? routing.taxiLeg(target) : routing.taxiLegTo(goal));
      },
    }),
  );
  C_Timer.NewTicker(TICK_SEC, () => {
    guard("engine", () => tick(started));
    if (isDisabled("engine")) clearArrow();
  });
  ensureItemButton();
  return started;
}

function onEvent(event: string, arg1: unknown, arg3: unknown): void {
  if (event === "PLAYER_LOGIN") {
    getAccountDb();
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
  } else if (event === "PLAYER_REGEN_DISABLED") {
    const button = itemButton;
    if (button != null) guard("itemButton", () => button.onCombatStart());
  } else if (event === "PLAYER_REGEN_ENABLED") {
    forcePending = true;
    ensureItemButton();
    const button = itemButton;
    if (button != null) guard("itemButton", () => button.onCombatEnd());
  } else if (ITEM_EVENTS.includes(event)) {
    syncItem();
  } else if (event === ITEM_INFO_EVENT) {
    itemInfoPending = true;
  } else if (event === SKILLS_EVENT) {
    current.skills.markDirty();
  } else if (event === "QUEST_LOG_UPDATE") {
    logDirty = true;
  } else if (FORCING_EVENTS.includes(event)) {
    forcePending = true;
    if (event === "PLAYER_ENTERING_WORLD") {
      current.skills.markDirty();
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
