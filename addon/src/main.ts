import { createArrow, playerPosition, type ArrowApi } from "./arrow/arrowFrame";
import { t } from "./core/l10n";
import { guard, reportOnce } from "./core/report";
import { loadCharDb } from "./core/storage";
import { createQuestRepository, type RepoResult } from "./data/questRepository";

_G.MinMaxQuest = { version: "0.1.0" };

let repoResult: RepoResult | null = null;

function getRepository(): RepoResult {
  if (repoResult == null) repoResult = createQuestRepository(_G.LibQuestieDB as LibQuestieDBApi | null);
  return repoResult;
}

let arrow: ArrowApi | null = null;

function getArrow(): ArrowApi {
  if (arrow == null) {
    const db = loadCharDb(_G.MinMaxQuestCharDB);
    _G.MinMaxQuestCharDB = db;
    arrow = createArrow(db);
  }
  return arrow;
}

const NORTH_TEST_YARDS = 100;

function handleArrowCommand(command: string): void {
  const api = getArrow();
  if (command === "move" || command === "lock") {
    api.setMoveMode(command === "move");
  } else if (command === "test") {
    const pos = playerPosition();
    if (pos == null) {
      print(`MinMaxQuest: ${t("positionUnavailable")}`);
      return;
    }
    api.setTarget({ pos: { continent: pos.continent, x: pos.x + NORTH_TEST_YARDS, y: pos.y }, label: "Test" });
  }
}

_G.SLASH_MMQ1 = "/mmq";
SlashCmdList["MMQ"] = (message: string) => {
  const text = message.trim();
  if (text.startsWith("arrow ")) {
    guard("arrow", () => handleArrowCommand(text.slice(6)));
    return;
  }
  const result = getRepository();
  if (!result.ok) {
    reportOnce("repository", result.message);
    return;
  }
  const id = Number(text.startsWith("q ") ? text.slice(2) : text);
  const quest = Number.isFinite(id) ? result.repo.get(id) : null;
  if (quest == null) {
    print(`MinMaxQuest: ${t("questNotFound")}`);
    return;
  }
  print(`MinMaxQuest: [${quest.id}] ${quest.name} level ${quest.level}, ${quest.objectives.length} objective(s)`);
};
