import { createQuestRepository, type RepoResult } from "./data/questRepository";

_G.MinMaxQuest = { version: "0.1.0" };

let repoResult: RepoResult | null = null;

function getRepository(): RepoResult {
  if (repoResult == null) repoResult = createQuestRepository(_G.LibQuestieDB as LibQuestieDBApi | null);
  return repoResult;
}

_G.SLASH_MMQ1 = "/mmq";
SlashCmdList["MMQ"] = (message: string) => {
  const result = getRepository();
  if (!result.ok) {
    print(`MinMaxQuest: ${result.message}`);
    return;
  }
  const text = message.trim();
  const id = Number(text.startsWith("q ") ? text.slice(2) : text);
  const quest = Number.isFinite(id) ? result.repo.get(id) : null;
  if (quest == null) {
    print("MinMaxQuest: quest not found");
    return;
  }
  print(`MinMaxQuest: [${quest.id}] ${quest.name} level ${quest.level}, ${quest.objectives.length} objective(s)`);
};
