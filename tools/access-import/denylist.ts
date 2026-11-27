export interface QuestExclusion {
  quest: number;
  reason: string;
}

// Step ids of one Horde-only or Alliance-only entry whose quest the other faction cannot take.
export interface StepExclusion {
  entry: string;
  steps: number[];
  quest: number;
  reason: string;
}

export interface Denylist {
  quests: QuestExclusion[];
  steps: StepExclusion[];
}

const SOD = "Season of Discovery quest, not on Forever";
const SPARKLE = "Duplicate of quest 2952 (identical in QuestieDB: both factions, not repeatable, no class); only 2952 is kept";
const ALLIANCE_ONLY = "Alliance-only quest listed in a Horde entry";

export const DENYLIST: Denylist = {
  quests: [
    { quest: 78916, reason: SOD },
    { quest: 78917, reason: SOD },
    { quest: 80324, reason: SOD },
    { quest: 80325, reason: SOD },
    { quest: 82062, reason: SOD },
    { quest: 84555, reason: SOD },
    { quest: 4601, reason: SPARKLE },
    { quest: 4602, reason: SPARKLE },
    { quest: 4605, reason: SPARKLE },
    { quest: 4606, reason: SPARKLE },
  ],
  steps: [
    { entry: "166", steps: [120, 140], quest: 96403, reason: ALLIANCE_ONLY },
    { entry: "351", steps: [725], quest: 2769, reason: ALLIANCE_ONLY },
    { entry: "356", steps: [1480], quest: 95262, reason: ALLIANCE_ONLY },
    { entry: "356", steps: [1490], quest: 96377, reason: ALLIANCE_ONLY },
  ],
};

export const NO_DENYLIST: Denylist = { quests: [], steps: [] };
