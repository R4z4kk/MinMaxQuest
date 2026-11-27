import { expiredConstants } from "../core/constants";
import { TRAVEL } from "../data/generated/travel";
import { getBuildOverride } from "../game/buildOverride";
import { COLOR, panel, PAD, SIZE, text } from "./theme";
import { bannerText } from "./viewModel";

export interface Banner {
  update(): void;
}

function clientBuild(): string | null {
  const override = getBuildOverride();
  if (override != null) return override;
  const [version, build] = GetBuildInfo();
  return version == null || build == null ? null : `${version}.${build}`;
}

// Informational only: never blocks the window.
export function createBanner(window: WowFrame): Banner {
  const frame = CreateFrame("Frame", null, window);
  frame.SetHeight(18);
  frame.SetPoint("BOTTOMLEFT", window, "TOPLEFT", 0, 2);
  frame.SetPoint("BOTTOMRIGHT", window, "TOPRIGHT", 0, 2);
  panel(frame);
  const message = text(frame, SIZE.small, COLOR.accent);
  message.SetPoint("LEFT", frame, "LEFT", PAD, 0);
  message.SetPoint("RIGHT", frame, "RIGHT", -PAD, 0);
  frame.Hide();
  return {
    update() {
      const value = bannerText(expiredConstants(date("%Y-%m-%d")), clientBuild(), TRAVEL.source.build);
      if (value == null) {
        frame.Hide();
        return;
      }
      message.SetText(value);
      frame.Show();
    },
  };
}
