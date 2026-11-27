# Optimization algorithms and solver tooling for precomputed WoW Classic leveling routes (1-60)

Research date: 2026-11-27. Note: Helsgaun's LKH-3 site (webhotel4.ruc.dk) refused connections during this session and web.archive.org was blocked, so LKH-3 details come from search snippets of that page/report and from a GitHub fork. Items marked "background knowledge" are not verified in this session and should be checked before being relied on.

## Q1. Which formal problem best models quest routing with level-dependent rewards?

### Takeaway
No textbook problem fits exactly. The closest is a **single-vehicle Orienteering / Prize-Collecting TSP with pickup-and-delivery precedence (accept -> objectives -> turn-in), chain precedences, and state-dependent (level-dependent) profits and release conditions (min level)**. The objective is a ratio or a fixed target (minimize time to reach 60 XP total), which is closer to a "quota" or prize-collecting TSP than a budgeted OP. The state-dependence (XP depends on level at turn-in; availability depends on accumulated XP) breaks the additive-profit assumption of every classical solver, so classical solvers can only be used on subproblems where the state is approximately frozen.

### Cited Findings
- OP literature has formal variants for time-dependent profits: profits that grow with service duration (OPSTP, Yu et al. 2019a), arrival-time-dependent scores (Yu et al. 2019b), and non-concave profits depending on arrival time and service duration (Yu et al. 2021); multi-profit OP (Kim & Kim 2020) assigns several time-dependent profits per vertex — [Shen, Zhou, Lei, Wu, "A survey of the orienteering problem…", arXiv 2512.16865, Dec 2025](https://arxiv.org/html/2512.16865v1)
- That 2025 survey taxonomizes OP extensions into time-based (time windows, time-dependent, multi-period), path-based, node-based (mandatory visits, capacity, Steiner), structure-based (set, clustered, synchronized team), and information-based (stochastic, dynamic, robust); the visible part does not cover precedence constraints — [arXiv 2512.16865](https://arxiv.org/html/2512.16865v1)
- Earlier reference surveys: Vansteenwegen et al. (2011) and Gunawan, Lau & Vansteenwegen (2016, EJOR 255(2):315-332) cover Team OP, (Team) OP with time windows, time-dependent OP — [EconPapers record of Gunawan et al. 2016](https://econpapers.repec.org/RePEc:eee:ejores:v:255:y:2016:i:2:p:315-332); Vansteenwegen & Gunawan (2019) Springer EURO tutorial book "Orienteering Problems" has a chapter covering time-dependent and stochastic profits — [Springer](https://link.springer.com/chapter/10.1007/978-3-030-29746-6_8)
- Closest academic analogue to "accept/turn-in with profit": Sun et al. (2018, EJOR) "time-dependent capacitated profitable tour problem with time windows and precedence constraints" — single vehicle, pickup-and-delivery requests each with a profit, delivery after pickup; exact algorithm solves up to 150 locations (75 requests); a restricted dynamic programming heuristic is proposed for speed — [VU Amsterdam PDF](https://research.vu.nl/ws/files/105340356/Thetimedependentcapacitatedprofitabletourproblemwithtimewindowsandprecedenceconstraints.pdf)
- Team OP with pickups and deliveries (TOPDP) solved with GRASP — [Univ. Vienna thesis](https://utheses-gateway.univie.ac.at/api/document/get/file/28540)
- Precedence-aware insertion: convex-hull cheapest insertion adapted to precedence-constrained TSP, inserting only into feasible segments so pickups precede deliveries — [Goutham & Stockar, arXiv 2405.03774, 2024](https://arxiv.org/html/2405.03774v3)
- Sequential Ordering Problem (SOP = ATSP with precedence constraints), PDTSP, TSPPD, OP and prize-collecting TSP are all listed as LKH-3-supported variants (search snippet of Helsgaun's LKH-3 page/report) — [LKH-3 page](http://webhotel4.ruc.dk/~keld/research/LKH-3/), [LKH-3 report](http://webhotel4.ruc.dk/~keld/research/LKH-3/LKH-3_REPORT.pdf)

### Inferences
- Mapping: quest giver = pickup node, objective areas = intermediate nodes (with a service time = kill/collect time, and a "mob XP" side profit), turn-in NPC = delivery node; quest chains = precedence arcs between deliveries of quest k and pickup of quest k+1; min level = a release condition on cumulative XP (resource-dependent release date rather than a clock time window). This is a PDTSP/SOP skeleton with OP-style optional requests.
- The level-dependent XP decay (penalty when player level > quest level + ~5) is a profit that depends on cumulative XP at turn-in time — formally a "state-dependent profit" analogous to arrival-time-dependent scores (Yu et al. 2019b), but with cumulative reward instead of clock time as the state. I found no paper modeling profit as a function of previously collected profit. Practical handling: (a) evaluate exactly in a simulator inside a metaheuristic (non-additive objective is fine for local search/ALNS/GA), and (b) for exact/MIP/LKH subproblems, freeze profits using the level estimated at the start of the segment (piecewise-constant approximation) and iterate.
- Objective choice: "minimize total time to accumulate XP(60)" is a quota/prize-collecting TSP formulation (collect at least Q prize, minimize cost), which avoids the ratio objective. Equivalent locally: maximize XP/hour per segment.
- Grinding mobs is a "continuous" alternative reward with a known XP/hour rate per level/zone; it acts as an opportunity-cost baseline: a quest is worth including only if its XP per marginal minute beats the grinding rate at that level. This is the natural penalty/prize scale for prize-collecting formulations.

### Gaps
- No source found for OP/PCTSP with profits depending on accumulated collected profit (cumulative-state rewards). This seems to be novel; treat it via simulation-based evaluation.
- Could not verify the exact LKH-3 TYPE list and which variants accept node prizes plus precedences simultaneously (site unreachable).

## Q2. Decomposition strategies for hundreds to 1000+ quests

### Takeaway
Use a **hierarchical, rolling-horizon decomposition**: (1) macro level — choose the sequence of zone/level-band "blocks" (small graph, ~20-40 zones per faction, solvable by beam search or DP with level as state); (2) micro level — within each block, solve a PDTSP/SOP-like routing over the selected quests (typically 20-150 nodes), where profits can be frozen per block; (3) global improvement — LNS that destroys and re-optimizes windows of the full route evaluated by the exact XP simulator.

### Cited Findings
- Large OP/TOP instances are now routinely attacked by decomposition: an LNS with clustering handles 7,000-node TOP instances within minutes (Chaigneau et al. 2025); giant-tour decomposition for (T)OPTW reaches a 0.30% optimality gap (Amarouche et al. 2020) — [arXiv 2512.16865](https://arxiv.org/html/2512.16865v1)
- Restricted dynamic programming (keeping only the best H states per stage — essentially beam search) is the fast heuristic used for the profitable tour problem with precedence — [Sun et al. 2018](https://research.vu.nl/ws/files/105340356/Thetimedependentcapacitatedprofitabletourproblemwithtimewindowsandprecedenceconstraints.pdf)
- Existing WoW route-generating addons/tools exist (e.g., Levelwise "plans the fastest leveling route from your character's current quests, XP and location, and replans when you go off-route"; Questwarden adds quests/chains where the route would otherwise leave you under-level for the next zone; Trailwright uses the GPL-3.0 "Shortest Path Forever" travel router) but none documented its optimization algorithm in what I found — [Levelwise](https://www.curseforge.com/wow/addons/levelwise), [Questwarden](https://www.curseforge.com/wow/addons/questwarden), [Trailwright](https://www.curseforge.com/wow/addons/trailwright)

### Inferences
- Travel-time matrix first: compute all-pairs travel times over a multimodal graph (walk/mount on navmesh-approximated grid, flight paths, boats/zeppelins, hearthstone as a special edge whose availability depends on cooldown and bind location). Hearthstone breaks pure static-matrix modeling (cooldown = time-dependent edge); handle it in the simulator and as a "teleport to bind point" move in local search, not inside LKH/MIP.
- Macro sequencing is small enough for exact DP/beam search: state = (current block, level bucket, set of completed key chains) is too large for full DP, but beam search with width 100-1000 over block orders evaluated by the micro solver is cheap.
- Rolling horizon: optimize the next ~2-3 levels in detail with the rest approximated, commit the first level, slide. This keeps the state-dependent profit error small because level changes little inside a window.
- Bands overlap across zones (e.g., two zones at 20-25); allowing quests from adjacent zones in the same block matters; clustering by geography + level, not by zone label alone.

### Gaps
- No published benchmark on WoW-like routing to calibrate block sizes; must be tuned empirically.

## Q3. Which metaheuristics work best; quality vs runtime at 50-500 nodes

### Takeaway
For PDTSP/SOP/OP subproblems of 50-500 nodes, LKH-3 and ALNS-type methods reach near-best-known solutions in seconds to minutes. Because our full objective is non-additive (level-dependent XP), the outer optimizer should be a **custom ALNS / LNS with simulated-annealing acceptance over the full route, evaluated by an exact simulator**, seeded by a greedy/beam-search constructor, and optionally calling LKH-3 or OR-Tools to re-sequence frozen-profit segments.

### Cited Findings
- OP state of the art: revisited branch-and-cut (Kobeaga et al. 2024) solved OP instances up to 7,397 nodes (18 new optima, 76 BKS); ALNS (Santini 2019) found 27 new BKS; EA4OP (evolutionary algorithm with edge recombination + Lin-Kernighan refinement) is robust on large instances — [arXiv 2512.16865](https://arxiv.org/html/2512.16865v1)
- TOP: two-index branch-and-cut (Bianchessi et al. 2018) limited to ~100 nodes; HALNS (Hammami et al. 2020) reaches 100% of BKS on standard sets by embedding an exact set-packing model — [arXiv 2512.16865](https://arxiv.org/html/2512.16865v1)
- TOPTW/OPTW: constraint programming (Gedik et al. 2017) found 119 BKS — [arXiv 2512.16865](https://arxiv.org/html/2512.16865v1)
- LKH-3 transforms constrained variants into a constrained TSP, searches in infeasible space, and uses problem-specific violation (penalty) functions; it handles about 40 TSP variants — [Reinforced LKH paper, arXiv 2207.03876](https://arxiv.org/pdf/2207.03876)
- LKH-3 is described as state of the art but "achieving high-precision solutions with LKH-3 incurs significant computational costs" for very large instances — [search snippet of neural CO literature](https://arxiv.org/pdf/2310.07985)
- Exact profitable tour with precedence: up to 150 locations solved optimally; restricted DP heuristic offered for speed — [Sun et al. 2018](https://research.vu.nl/ws/files/105340356/Thetimedependentcapacitatedprofitabletourproblemwithtimewindowsandprecedenceconstraints.pdf)

### Inferences
- Background knowledge (not verified this session): for SOP, LKH-3 and ACO hybrids (e.g., Enhanced ACS) hold most TSPLIB SOP best-knowns; MIP (HiGHS/CP-SAT) for SOP/PDTSP with precedence is practical only up to roughly 50-100 nodes within minutes — treat as a rough rule of thumb.
- Recommended ALNS operators for this domain: destroy = random quest removal, related removal (same zone/level band), chain removal (remove a whole quest chain), worst-ratio removal (lowest XP per marginal minute), segment removal (a contiguous time window); repair = greedy cheapest insertion respecting precedence (accept before objectives before turn-in; chain order; min-level feasibility checked by simulator), regret-k insertion. Acceptance = simulated annealing or record-to-record. Intra-route improvement = precedence-preserving 2-opt/or-opt/relocate on step order.
- Genetic/memetic algorithms (EA4OP-like) are a viable alternative but cost more evaluations; MCTS is attractive only for the macro block order where branching is small.
- Beam search over "next quest-step" with a good heuristic (XP per minute lookahead) is the best constructor and is itself competitive for a first version.
- Determinism for daily CI: fix RNG seeds; keep the best-of-N runs; diff routes day to day and require improvements to exceed a threshold before replacing a published route (stability for users).

### Gaps
- No direct published runtime/quality figures for 50-500-node SOP/PDTSP with LKH-3 were retrieved this session (LKH-3 report unreachable).

## Q4. Can ML (RL, attention models, POMO) beat classical heuristics here without human data?

### Takeaway
Not practically. Neural constructive solvers (AM, POMO) are competitive with LKH-3 only on small, uniformly-random instances of the size they were trained on, degrade sharply on larger or out-of-distribution instances, and would need a custom environment for our non-standard constraints. RL needs no human data (it learns from a simulator), but the engineering and GPU cost far exceed the gain over ALNS + LKH-3 at our scale. Learned operators inside LNS are the only ML direction with reported wins at scale, and remain research-grade.

### Cited Findings
- POMO (aug x8) gap vs. Concorde: ~0.13% at TSP100, ~1.5% at TSP200 per one row, ~22% and ~40.6% at larger sizes up to TSP1000 (1.1 h) in the LEHD paper's table (extracted table partially garbled; check original) — [Luo et al., "Neural Combinatorial Optimization with Heavy Decoder", arXiv 2310.07985](https://arxiv.org/pdf/2310.07985)
- POMO trained at fixed size/distribution shows "severe generalization issue"; generalization limited to slightly shifted distributions — [Zhou et al., Omni-generalizable neural methods for VRP, arXiv 2305.19587](https://arxiv.org/pdf/2305.19587); [On the Generalization of NCO heuristics, arXiv 2206.00787](https://arxiv.org/pdf/2206.00787)
- POMO gap vs. LKH-3 on CVRP-100 under 1% in about a minute (survey statement) — [search results, NCO survey](https://arxiv.org/pdf/2505.04558.pdf)
- Attention Model (Kool et al.) learned heuristics for VRP variants, the OP and a stochastic variant with the same hyperparameters — [arXiv 1803.08475](https://arxiv.org/pdf/1803.08475v3)
- RL4CO benchmark: 27 CO environments including OP, 23 baselines including AM and POMO — [RL4CO, arXiv 2306.17100](https://arxiv.org/pdf/2306.17100v6)
- Pointer network + RL for OPTW reported better than heuristics on its benchmarks (Gama & Fernandes 2021); learned operators in LNS (Fang et al. 2023) "can outperform hand-crafted heuristics on large-scale instances" (survey's characterization) — [arXiv 2512.16865](https://arxiv.org/html/2512.16865v1)

### Inferences
- Our instances are a single, fixed, structured graph (the game world) re-solved daily with small data changes — the opposite of the "many random instances" regime where amortized neural solvers pay off. A per-instance search (ALNS) exploits the fixed instance better.
- ML could still help cheaply in a narrow role: learning/estimating objective-completion times (kill rates, drop rates) from data, or a bandit over ALNS operator weights (standard ALNS adaptive weights already do this).

### Gaps
- Could not extract the AM OP table (OP20/50/100 vs. Gurobi/Compass) from the PDF in this session; no OP benchmark at >500 nodes with neural solvers found.

## Q5. Solver tooling callable from Node/TypeScript (license, maintenance, CI)

### Takeaway
There is no official OR-Tools Node binding. The robust options are: (1) **custom TypeScript ALNS + simulator** as the core (full control over the non-additive objective, zero native deps); (2) **LKH-3 binary via child_process** for frozen-profit segment re-sequencing (research-only license — check before redistributing); (3) **OR-Tools via a small Python CLI/subprocess** (Apache-2.0, pip wheels, pickup-delivery + disjunction penalties = prize-collecting PDTSP); (4) **HiGHS via the `highs` npm WASM package** for small exact checks/lower bounds. VROOM, Timefold, jsprit are fleet-VRP oriented and add little here.

### Cited Findings
- OR-Tools: no official npm package; mapbox/node-or-tools (TSP/VRP bindings) dates from 2017 with prebuilt binaries for Node 4/6 only; @revolugo/ortools wraps only integer programming classes and has very low usage; Google's @googlemaps/routeoptimization is a hosted cloud API client, not a local solver — [mapbox/node-or-tools](https://github.com/mapbox/node-or-tools/blob/v1.0.0/API.md), [@revolugo/ortools](https://npmjs.com/package/@revolugo/ortools), [Route Optimization API Node client](https://docs.cloud.google.com/nodejs/docs/reference/routeoptimization/latest)
- OR-Tools releases: v9.13/v9.14/v9.15 listed on the release-notes page (dates on the page were inconsistent in search snippet; check GitHub releases) — [OR-Tools release notes](https://developers.google.com/optimization/support/release_notes)
- OR-Tools routing models optional visits via `routing.AddDisjunction([node], penalty)` — dropping a node adds its penalty to the objective (prize-collecting); per-node penalties allowed; search uses e.g. `PATH_CHEAPEST_ARC` first solution + `GUIDED_LOCAL_SEARCH` with a time limit — [OR-Tools "Penalties and dropping visits"](https://developers.google.com/optimization/routing/penalties)
- LKH-3: ~40 TSP variants; latest README in a fork covers LKH-3.0.6 (May 2019) and lists CVRP, CVRPTW, ATSP, mTSP, TSPDL, CTSP, MLP, SOP, Steiner TSP, OCMTSP; built with `make`, run as `./LKH file.par`; license: "distributed for research use", "The author reserves all rights to the code" — [c4v4/LKH3 fork README](https://github.com/c4v4/LKH3); variant list (search snippet) includes SOP, PDTSP, TSPPD, 1-PDTSP, m-PDTSP, OP, PC-TSP (prize-collecting) and PCTSP (precedence-constrained colored TSP) — [LKH-3 page](http://webhotel4.ruc.dk/~keld/research/LKH-3/)
- HiGHS in JS: `highs` npm (highs-js, v1.8.0 in snippet) is HiGHS compiled to WebAssembly via emscripten, MILP capable, wasm shipped in the package; `highs-solver` is a native Node binding with warm starts and non-blocking solves; `@bubblyworld/highs-ts` is a WASM build with TypeScript bindings and zero runtime deps — [highs npm](https://npmjs.com/package/highs), [highs-solver](https://www.npmjs.com/package/highs-solver), [@bubblyworld/highs-ts](https://cdn.jsdelivr.net/npm/@bubblyworld/highs-ts@1.2.0/README.md)
- VROOM: BSD-2-Clause; handles TSP, CVRP, VRPTW, multi-depot heterogeneous VRPTW and PDPTW; "shipments" = paired pickup-and-delivery in same route; per-task priority decides which tasks to keep when not all can be served — [VROOM README](https://raw.githubusercontent.com/VROOM-Project/vroom/HEAD/README.md), [pgRouting VROOM docs](https://vrp.pgrouting.org/v0/en/vroom-category.html); Python binding pyvroom exists — [PyPI pyvroom](https://pypi.python.org/project/pyvroom/)
- Timefold Solver: Community Edition Apache-2.0 (Java/Kotlin/Python), forked from OptaPlanner on 20 April 2023; Enterprise edition proprietary with expiring licenses (solver refuses to start after expiry) — [Timefold FAQ](https://docs.timefold.ai/timefold-solver/latest/frequently-asked-questions), [Timefold license](https://timefold.ai/license), [GitHub](https://github.com/TimefoldAI/timefold-solver)

### Inferences
- OR-Tools Python from Node: spawn `python solve.py < input.json > output.json` in CI; pip wheel install is one line. Pickup-and-delivery + `AddDisjunction` with penalty ≈ prize-collecting PDTSP; precedence across chains via a time dimension and `solver.Add(time(a) <= time(b))` (background knowledge of the API; verify). Static profits only — so use it for frozen-profit segments.
- LKH-3 license is the main risk: fine for an internal CI tool producing data, but bundling/redistributing the binary in an open-source addon repo is not clearly permitted. Building from source in CI (`make`) avoids shipping binaries.
- VROOM "priority" is a lexicographic preference, not an additive prize trade-off against time, so it is a poor fit for XP-per-hour trade-offs. Timefold could express the full non-additive objective (score calculators are arbitrary code) but requires the JVM/Python in CI and a non-TS codebase. jsprit (Java): maintenance status not verified.
- Given the CLAUDE.md preference for TypeScript and robust error handling, a pure-TS core with optional subprocess solvers keeps CI simple: a missing/failed external solver must fail loudly (non-zero exit), never silently fall back.

### Gaps
- jsprit license/maintenance not verified. glpk.js status not checked (HiGHS WASM supersedes it for MILP in practice, unverified). OR-Tools v9.15 exact release date unverified.

## Q6. How to evaluate route quality

### Takeaway
Evaluate every route with a single **deterministic leveling simulator** (same one used inside the optimizer) reporting simulated time-to-60 and XP/hour per level; compare against encoded human guides run through the same simulator, plus cheap lower bounds per segment (LP/assignment relaxations, or "best XP/minute" bounds) to estimate the gap.

### Cited Findings
- Human-made guides are widely used baselines (Icy Veins leveling guide; guide addons such as Guidelime, RestedXP, Questwarden, Alenya's Guides) — [Icy Veins](https://www.icy-veins.com/wow-classic/leveling-guide), [Guidelime GitHub](https://github.com/max-ri/Guidelime), [Questwarden](https://www.curseforge.com/wow/addons/questwarden)
- OP literature evaluates against best-known solutions and exact bounds (branch-and-cut optimality, % gap, BKS counts) — [arXiv 2512.16865](https://arxiv.org/html/2512.16865v1)

### Inferences
- Encode 1-2 public guide routes (e.g., Guidelime-format guides, which are text step lists) into the step format and simulate them: "our route reaches 60 in X h vs guide Y h" is the most meaningful metric. Guide formats being plain text makes this cheap.
- Lower bounds: (a) per level, time ≥ XP_needed / (max achievable XP per minute among quests and grinding at that level); (b) for frozen-profit segments, the LP relaxation of the prize-collecting TSP (HiGHS WASM) or LKH-3's 1-tree bound for the pure TSP part. These are loose but catch gross regressions.
- CI regression tests: per faction/start zone, fail the build if simulated time-to-60 worsens by more than a threshold vs the last published route, if any step violates precedence/min-level, or if input data (spawn coordinates, XP tables) is missing/stale. Simulator parameters (mob kill time, mount speed, flight times, XP decay formula, rested XP) are moving data: source them, date them, and fail loudly when expired.
- Robustness: run the simulator with perturbed parameters (e.g., ±20% kill time) to prefer routes whose ranking is stable.

### Gaps
- No public dataset of measured real-player times per guide was found to calibrate the simulator.

## Recommended practical architecture (synthesis)

### Takeaway
Build a pure-TypeScript pipeline: travel-time graph -> exact leveling simulator (objective) -> beam-search constructor (macro zone/level blocks + greedy XP/min steps) -> ALNS with SA acceptance over the full route (precedence-aware operators, simulator evaluation, fixed seeds) -> optional LKH-3 (child process, frozen-profit SOP/PDTSP per block) or OR-Tools Python subprocess for intra-block re-sequencing -> evaluation vs encoded human guides and lower bounds in CI.

### Cited Findings
- ALNS and LNS-with-decomposition are among the strongest published methods for large OP/TOP (ALNS 27 new BKS; HALNS 100% BKS; clustered LNS on 7,000 nodes in minutes) — [arXiv 2512.16865](https://arxiv.org/html/2512.16865v1)
- LKH-3 handles SOP/PDTSP/OP/PC-TSP via penalty-based constrained TSP search — [arXiv 2207.03876](https://arxiv.org/pdf/2207.03876), [LKH-3 page](http://webhotel4.ruc.dk/~keld/research/LKH-3/)
- No maintained official Node binding for OR-Tools — [mapbox/node-or-tools](https://github.com/mapbox/node-or-tools/blob/v1.0.0/API.md)

### Inferences
- Phase 1 (ship fast): simulator + beam search only; already beats naive greedy and gives a comparable time-to-60 metric.
- Phase 2: ALNS on top (largest expected gain, all in TS).
- Phase 3 (only if Phase 2 plateaus): external solvers for block re-sequencing. Skip ML entirely.
- Expected CI runtime: minutes per faction/start-zone on a CI runner for ALNS with ~10^5-10^6 simulator evaluations, provided the simulator is incremental (re-simulate from the first changed step). This is an estimate, not a measured figure.

### Gaps
- No measured runtime for this exact pipeline; must benchmark.
