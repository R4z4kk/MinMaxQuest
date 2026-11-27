# MinMaxQuest project rules

## README.md is the public description

`README.md` is the addon description for GitHub, CurseForge and Wago. Keep it true to the code.

- Any change that adds, removes or alters a user-visible behaviour (feature, option, command, default, requirement) updates the **Features** / **Commands** / **Requirements** sections in the same PR. Features must stay complete, not a highlight reel.
- Every release replaces the **Latest update** section with the new version and a short summary of what changed. Only the latest one; no full changelog.
- Roadmap items move to Features when shipped.
- Internal-only changes (refactors, tests, CI) do not touch the README.

## Releases

- Tag `vX.Y.Z` (release), `vX.Y.Z-beta.N` or `vX.Y.Z-alpha.N` from `main`; `.github/workflows/release.yml` packages and uploads to CurseForge, Wago and GitHub.
- Before tagging: README **Latest update** matches the tag, `_G.MinMaxQuest.version` in `addon/src/main.ts` matches the tag.
- Publishing is public: tag only after the user says yes.
