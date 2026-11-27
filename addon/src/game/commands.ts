import { walkChain } from "../access/chains";
import { playerPosition, type ArrowApi } from "../arrow/arrowFrame";
import { formatDuration } from "../core/geometry";
import { t } from "../core/l10n";
import { guard } from "../core/report";
import type { QuestRepository } from "../data/questRepository";
import type { Target } from "../targets/completion";
import { setBuildOverride } from "./buildOverride";
import { describeTarget, type Engine } from "./engine";

const LISTED_TARGETS = 5;
const NORTH_TEST_YARDS = 100;

export interface CommandGame {
  engine: Engine;
  repo: QuestRepository;
}

export interface CommandContext {
  repository(): QuestRepository | null;
  arrow(): ArrowApi;
  game(): CommandGame | null;
  toggleWindow(): void;
}

export interface Commands {
  handle(message: string): void;
  targetChanged(current: Target | null): void;
}

function say(message: string): void {
  print(`MinMaxQuest: ${message}`);
}

function questName(repo: QuestRepository, id: number): string {
  return `[${id}] ${repo.get(id)?.name ?? "?"}`;
}

export function createCommands(ctx: CommandContext): Commands {
  let pendingSkip: number | null = null;

  const arrowCommand = (command: string): void => {
    if (command !== "move" && command !== "lock" && command !== "test") {
      say(t("arrowUsage"));
      return;
    }
    const api = ctx.arrow();
    if (command !== "test") {
      api.setMoveMode(command === "move");
      return;
    }
    const pos = playerPosition();
    if (pos == null) {
      say(t("positionUnavailable"));
      return;
    }
    api.setTarget({ pos: { continent: pos.continent, x: pos.x + NORTH_TEST_YARDS, y: pos.y }, label: "Test" });
  };

  const questCommand = (arg: string): void => {
    const repo = ctx.repository();
    if (repo == null) return;
    const id = Number(arg);
    const quest = Number.isFinite(id) ? repo.get(id) : null;
    if (quest == null) say(t("questNotFound"));
    else {
      say(
        t("questInfo")
          .replace("{id}", String(quest.id))
          .replace("{name}", quest.name)
          .replace("{level}", String(quest.level))
          .replace("{n}", String(quest.objectives.length)),
      );
    }
    const error = repo.lastError();
    if (error != null) say(t("repositoryLastError").replace("{error}", error));
  };

  const chainCommand = (arg: string): void => {
    const repo = ctx.repository();
    if (repo == null) return;
    const id = Number(arg);
    const steps = Number.isFinite(id) ? walkChain([id], (questId) => repo.get(questId)) : [];
    if (steps.length === 0) {
      say(t("questNotFound"));
      return;
    }
    say(steps.map((step) => questName(repo, step)).join(" > "));
  };

  const targetsCommand = (game: CommandGame): void => {
    const list = game.engine.targets();
    if (list.length === 0) {
      say(t("noTarget"));
      return;
    }
    for (const target of list.slice(0, LISTED_TARGETS)) {
      const quest = game.repo.get(target.questId);
      say(`[${target.questId}] ${describeTarget(target, quest)} · ${formatDuration(target.seconds)}`);
    }
  };

  const skipCommand = (game: CommandGame, confirm: boolean): void => {
    const id = confirm && pendingSkip != null ? pendingSkip : game.engine.current()?.questId;
    if (id == null) {
      say(t("noTarget"));
      return;
    }
    const result = game.engine.skip(id, confirm && pendingSkip === id);
    if (result.needsConfirm) {
      pendingSkip = id;
      const xp =
        result.lost == null ? t("lostXpUnknown") : t("lostXp").replace("{xp}", String(Math.round(result.lost.xp)));
      say(
        t("skipConfirm")
          .replace("{n}", String(result.followUps.length))
          .replace("{xp}", xp)
          .replace("{quest}", questName(game.repo, id)),
      );
      return;
    }
    pendingSkip = null;
    say(`${t("skipped")}: ${questName(game.repo, id)}`);
  };

  const pinCommand = (game: CommandGame, arg: string | null): void => {
    if (arg == null) {
      game.engine.pin(null);
      say(t("unpinned"));
      return;
    }
    const id = Number(arg);
    if (!Number.isFinite(id) || game.repo.get(id) == null) {
      say(t("questNotFound"));
      return;
    }
    game.engine.pin(id);
    say(`${t("pinned")}: ${questName(game.repo, id)}`);
  };

  const profileCommand = (game: CommandGame): void => {
    const { first, last } = game.engine.profile();
    if (first == null || last == null) {
      say(t("profileNone"));
      return;
    }
    say(t("profile").replace("{last}", last.toFixed(1)).replace("{first}", first.toFixed(1)));
  };

  const withGame = (run: (game: CommandGame) => void): void => {
    guard("engine", () => {
      const game = ctx.game();
      if (game != null) run(game);
    });
  };

  return {
    handle(message) {
      const text = message.trim();
      const space = text.indexOf(" ");
      const command = space < 0 ? text : text.slice(0, space);
      const arg = space < 0 ? "" : text.slice(space + 1).trim();
      if (command === "") ctx.toggleWindow();
      else if (command === "arrow") guard("arrow", () => arrowCommand(arg));
      else if (command === "q") guard("repository", () => questCommand(arg));
      else if (command === "chain") guard("repository", () => chainCommand(arg));
      else if (command === "targets") withGame(targetsCommand);
      else if (command === "skip") withGame((game) => skipCommand(game, arg === "confirm"));
      else if (command === "pin") withGame((game) => pinCommand(game, arg));
      else if (command === "unpin") withGame((game) => pinCommand(game, null));
      else if (command === "debug" && arg === "prof") withGame(profileCommand);
      else if (command === "debug" && arg.startsWith("build ")) {
        const build = arg.slice(6).trim();
        setBuildOverride(build);
        say(`${t("buildOverride")}: ${build}`);
      } else say(t("help"));
    },
    targetChanged(current) {
      if (pendingSkip != null && current?.questId !== pendingSkip) pendingSkip = null;
    },
  };
}
