import { walkChain } from "./access/chains";
import { createArrow, playerPosition, type ArrowApi, type ArrowTarget } from "./arrow/arrowFrame";
import { formatDuration } from "./core/geometry";
import { t } from "./core/l10n";
import { guard, reportOnce } from "./core/report";
import { loadCharDb, type CharDb } from "./core/storage";
import { createQuestRepository, type QuestRepository, type RepoResult } from "./data/questRepository";
import { setBuildOverride } from "./game/buildOverride";
import { createEngine, describeTarget, type Engine } from "./game/engine";
import { createPlayerState, HEARTHSTONE_SPELL_ID, type PlayerStateReader } from "./game/playerState";
import { createPositions, mapToWorld } from "./game/positions";
import { createRouting } from "./game/routing";

_G.MinMaxQuest = { version: "0.1.0" };

const TICK_SEC = 0.5;
const LISTED_TARGETS = 5;
const NORTH_TEST_YARDS = 100;
const EVENTS = [
  "PLAYER_LOGIN",
  "PLAYER_ENTERING_WORLD",
  "QUEST_ACCEPTED",
  "QUEST_TURNED_IN",
  "QUEST_LOG_UPDATE",
  "ZONE_CHANGED_NEW_AREA",
  "PLAYER_LEVEL_UP",
  "UNIT_SPELLCAST_SUCCEEDED",
  "HEARTHSTONE_BOUND",
];

interface Game {
  engine: Engine;
  player: PlayerStateReader;
  repo: QuestRepository;
}

function say(message: string): void {
  print(`MinMaxQuest: ${message}`);
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

function syncArrow(): void {
  if (game == null) return;
  const next = game.engine.arrowTarget();
  if (next === shownArrow) return;
  shownArrow = next;
  guard("arrow", () => getArrow().setTarget(next));
}

function start(): Game | null {
  if (game != null) return game;
  const repo = getRepository();
  if (repo == null) return null;
  const charDb = getDb();
  const player = createPlayerState(_G.LibQuestieDB as LibQuestieDBApi, charDb);
  const routing = createRouting(repo, charDb, createPositions(repo, mapToWorld(repo)));
  const engine = createEngine(
    {
      now: () => GetTime(),
      readPlayer: () => player.read(),
      readPosition: () => playerPosition(),
      completion: (snap) => routing.completion(snap),
      firstHop: (target) => routing.firstHop(target),
      getQuest: (id) => repo.get(id),
      allQuests: () => routing.quests(),
      onTargets: () => syncArrow(),
    },
    charDb,
  );
  game = { engine, player, repo };
  C_Timer.NewTicker(TICK_SEC, () =>
    guard("engine", () => {
      engine.refreshTargets(false);
      syncArrow();
    }),
  );
  return game;
}

function onEvent(event: string, arg1: unknown, arg3: unknown): void {
  if (event === "PLAYER_LOGIN") {
    start();
    return;
  }
  const current = game;
  if (current == null) return;
  const { player, engine } = current;
  if (event === "UNIT_SPELLCAST_SUCCEEDED") {
    if (arg1 === "player" && arg3 === HEARTHSTONE_SPELL_ID) player.hearthCast();
    return;
  }
  if (event === "HEARTHSTONE_BOUND") {
    player.hearthBound();
    return;
  }
  if (event === "PLAYER_ENTERING_WORLD") {
    player.enteredWorld();
    player.markCompletedDirty();
    player.markLogDirty();
  } else if (event === "QUEST_TURNED_IN") {
    if (typeof arg1 === "number") player.markTurnedIn(arg1);
    else player.markCompletedDirty();
  } else if (event === "QUEST_ACCEPTED" || event === "QUEST_LOG_UPDATE") {
    player.markLogDirty();
  }
  engine.refreshTargets(true);
}

const events = CreateFrame("Frame", "MinMaxQuestEvents", UIParent);
for (const event of EVENTS) events.RegisterEvent(event);
events.SetScript("OnEvent", (_frame, event, arg1, _arg2, arg3) => {
  guard("engine", () => onEvent(event, arg1, arg3));
});

function handleArrowCommand(command: string): void {
  if (command !== "move" && command !== "lock" && command !== "test") {
    say(t("arrowUsage"));
    return;
  }
  const api = getArrow();
  if (command === "move" || command === "lock") {
    api.setMoveMode(command === "move");
  } else if (command === "test") {
    const pos = playerPosition();
    if (pos == null) {
      say(t("positionUnavailable"));
      return;
    }
    api.setTarget({ pos: { continent: pos.continent, x: pos.x + NORTH_TEST_YARDS, y: pos.y }, label: "Test" });
  }
}

function questName(repo: QuestRepository, id: number): string {
  return `[${id}] ${repo.get(id)?.name ?? "?"}`;
}

function questCommand(arg: string): void {
  const repo = getRepository();
  if (repo == null) return;
  const id = Number(arg);
  const quest = Number.isFinite(id) ? repo.get(id) : null;
  if (quest == null) {
    say(t("questNotFound"));
    return;
  }
  say(`[${quest.id}] ${quest.name} level ${quest.level}, ${quest.objectives.length} objective(s)`);
}

function chainCommand(arg: string): void {
  const repo = getRepository();
  if (repo == null) return;
  const id = Number(arg);
  const steps = Number.isFinite(id) ? walkChain([id], (questId) => repo.get(questId)) : [];
  if (steps.length === 0) {
    say(t("questNotFound"));
    return;
  }
  say(steps.map((step) => questName(repo, step)).join(" > "));
}

function targetsCommand(current: Game): void {
  const list = current.engine.targets();
  if (list.length === 0) {
    say(t("noTarget"));
    return;
  }
  for (const target of list.slice(0, LISTED_TARGETS)) {
    const quest = current.repo.get(target.questId);
    say(`[${target.questId}] ${describeTarget(target, quest)} · ${formatDuration(target.seconds)}`);
  }
}

let pendingSkip: number | null = null;

function skipCommand(current: Game, confirm: boolean): void {
  const id = confirm && pendingSkip != null ? pendingSkip : current.engine.current()?.questId;
  if (id == null) {
    say(t("noTarget"));
    return;
  }
  const result = current.engine.skip(id, confirm && pendingSkip === id);
  if (result.needsConfirm) {
    pendingSkip = id;
    say(
      t("skipConfirm")
        .replace("{n}", String(result.followUps.length))
        .replace("{xp}", String(Math.round(result.lost.xp))),
    );
    return;
  }
  pendingSkip = null;
  say(`${t("skipped")}: ${questName(current.repo, id)}`);
}

function pinCommand(current: Game, arg: string | null): void {
  if (arg == null) {
    current.engine.pin(null);
    say(t("unpinned"));
    return;
  }
  const id = Number(arg);
  if (!Number.isFinite(id) || current.repo.get(id) == null) {
    say(t("questNotFound"));
    return;
  }
  current.engine.pin(id);
  say(`${t("pinned")}: ${questName(current.repo, id)}`);
}

function engineCommand(run: (current: Game) => void): void {
  guard("engine", () => {
    const current = start();
    if (current != null) run(current);
  });
}

_G.SLASH_MMQ1 = "/mmq";
SlashCmdList["MMQ"] = (message: string) => {
  const text = message.trim();
  const space = text.indexOf(" ");
  const command = space < 0 ? text : text.slice(0, space);
  const arg = space < 0 ? "" : text.slice(space + 1).trim();
  if (command === "arrow") guard("arrow", () => handleArrowCommand(arg));
  else if (command === "q") guard("repository", () => questCommand(arg));
  else if (command === "chain") guard("repository", () => chainCommand(arg));
  else if (command === "targets") engineCommand(targetsCommand);
  else if (command === "skip") engineCommand((current) => skipCommand(current, arg === "confirm"));
  else if (command === "pin") engineCommand((current) => pinCommand(current, arg));
  else if (command === "unpin") engineCommand((current) => pinCommand(current, null));
  else if (command === "debug" && arg.startsWith("build ")) {
    const build = arg.slice(6).trim();
    setBuildOverride(build);
    say(`${t("buildOverride")}: ${build}`);
  } else say(t("help"));
};
