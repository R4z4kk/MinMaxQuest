# Suivi de route dans le jeu (Plan 3a) — Conception

Date : 2026-11-27. Complète la spec principale [`2026-11-27-minmaxquest-design.md`](2026-11-27-minmaxquest-design.md), §6.1, §6.2 et §7.7. En cas de conflit, ce document prime pour l'onglet Quête.

> **[choix Claude]** = décision prise par moi, pas encore validée explicitement par l'utilisateur. Le reste vient de la spec principale ou de l'utilisateur.

## 1. Intention

Rendre visibles et suivables en jeu les routes calculées hors jeu au Plan 2 (`data/routes/Alliance.lua`, `Horde.lua`). Le joueur ouvre l'onglet Quête, la flèche le mène d'étape en étape du niveau 1 au niveau 60. S'il s'écarte, la route le rattrape sans recalcul global (spec §4, approche B).

**Succès :** un personnage niveau 1 suit l'onglet Quête sans réfléchir. Les étapes déjà faites disparaissent d'elles-mêmes. Un écart (quête faite hors route, mort, groupe) ne casse rien.

**Anti-objectifs :**
- une route qui reste bloquée sur une étape impossible ;
- une flèche qui saute d'une cible à l'autre ;
- une chute de FPS ;
- des données de route décodées pour les 16 variantes en mémoire.

## 2. Périmètre

**Dans ce plan :**
- chargement des routes ;
- choix du segment de départ et de la variante ;
- avancement dans les étapes, hors route, recalage ;
- passer une étape ;
- insertion des chaînes d'Accès suivies et des retours en donjon ;
- onglet Quête complet ;
- mode actif ;
- packaging des routes dans l'add-on.

**Hors de ce plan :**
- **Plan 3b :** télémétrie, temps de kill mesuré (PV / DPS), XP/min mesurée.
- **Plan 3c :** optimiseur ALNS.
- **Plan 3d :** régénération quotidienne en CI et publication automatique.

## 3. Décisions

### 3.1 Mode actif (utilisateur)
- La flèche suit **le dernier onglet ouvert entre Quête et Complétion**. L'onglet Accès ne change pas le mode.
- Le mode est sauvegardé par personnage (`db.activeMode: "quest" | "completion"`). Par défaut il vaut `"quest"` (spec §6.1 : Quête par défaut).
- Le pied de l'onglet Accès affiche déjà « Mode actif » ; il montre la vraie valeur.
- **L'épinglage garde la priorité dans les deux modes.** En mode Quête, une quête épinglée devient la cible avec la même construction qu'en Complétion (prise, objectif ou rendu selon son état), qu'elle soit dans la route ou non. La route reprend quand l'épinglage est levé. **[choix Claude]**

### 3.2 Architecture (utilisateur : approche retenue)
- Le suivi est **une nouvelle source de cibles** du moteur existant (`game/engine.ts`).
  - En mode Complétion, le moteur interroge `completion(snapshot)` comme aujourd'hui.
  - En mode Quête, il interroge `route(snapshot)`, qui renvoie l'étape en cours puis les suivantes sous forme de `Target`.
- Sont réutilisés sans changement :
  - la flèche et sa boucle sur les points d'apparition ;
  - les marqueurs de carte ;
  - le vol automatique ;
  - le graphe de trajet ;
  - le bouton Passer et sa fenêtre d'avertissement ;
  - le bandeau de données périmées.
- Pas de second moteur, pas de recalcul global en jeu.

### 3.3 Chargement des données [choix Claude, présenté à l'utilisateur]
- Les deux fichiers `data/routes/Alliance.lua` et `Horde.lua` sont chargés par le `.toc` principal, avant `build\MinMaxQuest.lua`. On n'utilise pas d'add-ons de données chargés à la demande : environ 0,8 Mo de texte par faction suffit.
- `.pkgmeta` cesse d'ignorer `data/routes/*.lua`. `data/routes/report.md` reste exclu du paquet.
- Seule la variante choisie est décodée (`decodeSteps`, `addon/src/route/format.ts`). Les autres restent des chaînes. Un changement de variante décode la nouvelle et libère l'ancienne.
- Si le fichier de la faction est absent ou si le décodage échoue, l'onglet affiche « Routes non installées » avec un bouton vers Complétion. Le message part une seule fois via `reportOnce`, sans erreur Lua en boucle.
- Si `meta.build` diffère de `GetBuildInfo()`, le bandeau existant (§6.9) l'indique, sans bloquer.

### 3.4 Composition de la route du personnage
- **Segment de départ :** le générateur ajoute au fichier une table `segmentRaces = { [zoneKey] = raceMask }`, prise dans le `raceMask` des zones de départ du monde. En jeu, la race du personnage (`UnitRace` → masque via QuestieDB) choisit le segment dont le masque la contient. **[choix Claude]**
- **Route du personnage** = segment de départ, puis tronc de la même variante. Si aucun segment ne correspond à la race, ou si le niveau est au moins égal à `segmentEndLevel` (10), la route est le tronc seul.
- **Variante :** clé `e{elites}d{donjons}x{écart}` d'après les options de l'onglet Quête, déjà sauvegardées (`routeElites`, `routeDungeons`, `minLevelGap`).
- **Une étape porteuse d'un masque `races` qui exclut le personnage est retirée** de sa route au chargement.

### 3.5 Quand une étape est-elle faite [choix Claude, sauf mention]
Une étape de quête (`accept`, `complete`, `turnin`) n'est faite que si sa propre condition est vraie.

Une étape sans quête (`fly`, `hearth`, `setHearth`, `getFlightPath`, `grind`, `dungeon`) est faite si sa propre condition est vraie, **ou si un `turnin` placé plus loin dans la route est fait**. Seul un rendu compte : une quête prise en avance ne fait pas sauter des étapes. Cette règle couvre les étapes de déplacement sans rien sauvegarder. **[choix Claude]**

| Type | Condition propre |
|---|---|
| `accept` | quête dans le journal ou rendue (`C_QuestLog.IsQuestFlaggedCompleted`) (spec) |
| `complete` | objectif rempli dans le journal, ou quête rendue (spec) |
| `turnin` | quête rendue (spec) |
| `getFlightPath` | relais connu (relais enregistrés à l'ouverture de la carte de vol) (spec) |
| `grind` | niveau et XP du joueur ≥ `targetLevel` / `targetXpIntoLevel` de l'étape. Le grind final souvent inutile est donc fait d'office. |
| `dungeon` | toutes les quêtes acceptées avant l'étape et rendues après elle ont leurs objectifs remplis, ou sont rendues |
| `fly` | joueur à moins de 150 yd du relais de destination |
| `hearth` | joueur à moins de 150 yd de l'auberge où la pierre est liée (`GetBindLocation`). Si la pierre est en recharge, l'étape est sautée : le graphe de trajet choisit marche ou griffon. |
| `setHearth` | `HEARTHSTONE_BOUND` reçu pendant que l'étape est en cours, ou lieu lié déjà égal à la zone de l'aubergiste |

**L'étape en cours** est la première étape non faite à partir de `db.routeStartIndex`, en ignorant les étapes retirées ou passées. Elle est recalculée à chaque événement de quête ou de niveau. Elle peut donc reculer : une quête abandonnée fait redevenir non faite son étape `accept`. **[choix Claude]**

**Étapes impossibles : jamais de blocage (anti-objectif §1).** **[choix Claude]**
- **Impossible pour de bon :**
  - quête exclusive déjà prise ;
  - classe ou race exclue ;
  - prérequis retiré de la route ;
  - quête absente de QuestieDB.

  L'étape est retirée automatiquement avec les étapes de la même quête et ses suites, comptée, et signalée une fois par `reportOnce`.
- **Impossible pour l'instant** (niveau requis pas atteint) : l'étape reste en cours, et la flèche vise la prochaine étape réalisable parmi les 15 suivantes (§3.6). Le bandeau « Hors route » gère l'écart de niveau.
- Une étape `complete` ou `turnin` dont la quête n'est ni dans le journal ni rendue n'est pas une impasse : son étape `accept` redevient l'étape en cours.

**Étapes sans quête comme cibles du moteur.** **[choix Claude]** Le type `Target` gagne une variante sans quête, avec type d'étape, position et libellé.
- `fly` : la flèche vise le maître de vol de départ, puis le vol automatique prend le relais vers `taxiNodeId`.
- `getFlightPath` et `setHearth` : la flèche vise le maître de vol ou l'aubergiste.
- `hearth` : pas de déplacement de flèche, libellé « Utilise ta pierre de foyer », comme le saut existant du graphe.
- `grind` : la flèche vise le point d'apparition, avec le libellé « Grind jusqu'au niveau N ».
- `dungeon` : la flèche vise l'entrée.

Ces étapes apparaissent dans « Ensuite ». « Passer » sur elles utilise `routeSkippedSteps` (§3.7). L'épinglage, `sameKey` et `describeTarget` traitent cette variante. C'est le seul changement du moteur.

### 3.6 Cible de la flèche, hors route, recalage (spec §6.2)
- **Cible normale :** l'étape en cours. Pour `complete`, la boucle sur les points d'apparition émise par le générateur sert de boucle de flèche, comme dans le moteur actuel (passage au point suivant à 25 yd).
- **Hors route (spec, N = 15) :** si le temps de trajet vers l'étape en cours dépasse 120 s, et qu'une étape **réalisable** parmi les 15 suivantes est au moins 60 s plus proche, la flèche vise celle-ci. Les seuils de 120 s et 60 s sont **[choix Claude]**. Réalisable veut dire :
  - pour `complete` ou `turnin`, la quête est dans le journal ;
  - pour `accept`, la quête est disponible (`isAvailable`) et le journal a de la place.

  L'étape en cours ne change pas pour autant : la route reprend son ordre une fois l'étape proche faite.
- **Bandeau « Hors route » (spec) :** il s'affiche quand le niveau du joueur s'écarte de plus de 3 du `targetLevel` de l'étape en cours.
  - **Un clic recale** : l'étape en cours devient la première étape non faite dont le `targetLevel` est au moins le niveau du joueur moins 1.
  - Le recalage est sauvegardé par personnage (`db.routeStartIndex`), et les étapes avant cet index sont considérées comme faites.
  - Un changement de variante remet l'index à 0 puis applique la même règle.
  - **Premier chargement d'un personnage qui n'est pas niveau 1** (aucun index sauvegardé) : le recalage se fait automatiquement, sans clic. Le bandeau ne sert ensuite que pour les écarts apparus en jeu. **[choix Claude]**
- **Au niveau 60** (spec), la route est terminée : l'onglet le dit et propose Complétion.

### 3.7 Passer une étape (spec §6.1)
- **Étape de quête :** même mécanisme que Complétion (`skippedQuests`, dialogue de suites perdues). Toutes ses étapes et celles de ses suites (`unlocks`) sont retirées.
- **Étape de déplacement ou de grind :** marquée passée dans `db.routeSkippedSteps` (variante + index). **[choix Claude]**
- **Élite ou quête de donjon passée :** spec §6.1, le suivi comble le manque d'XP avec l'étape `grind` la plus proche dans la route de base. Concrètement, aucune action : le bandeau « Hors route » et le recalage gèrent le décalage de niveau. **[choix Claude]**

### 3.8 Insertion des chaînes d'Accès et des retours en donjon
**C'est le seul calcul de route en jeu** (spec §6.2). Il est lancé au chargement et quand on coche ou décoche une chaîne ou un donjon.

- **Chaînes d'Accès suivies** (`db.trackedChains`) :
  - leurs quêtes absentes de la route du personnage sont insérées ;
  - pour chaque quête, on insère ses étapes `accept`, `complete` (un par objectif) et `turnin`, construites en jeu avec les positions QuestieDB (`createPositions`), comme en Complétion ;
  - l'ordre de la chaîne et accept → objectifs → rendu sont respectés.
- **Retours en donjon** (utilisateur : une option par donjon, spec §7.7) :
  - une liste « Donjons » dans l'onglet Quête affiche une case par donjon ayant un bloc `returnBlocks` dans la faction ;
  - les noms viennent de `C_Map.GetAreaInfo(areaId)` ;
  - le choix est sauvegardé dans `db.dungeonReturns: number[]` ; tout est décoché par défaut, car les retours liés à une chaîne d'Accès sont déjà dans la route ;
  - cocher un donjon insère son bloc tel quel (étapes déjà émises).
- **Position d'insertion :** pour chaque bloc, on teste toutes les positions après l'étape en cours qui respectent l'ordre et le niveau minimum (`targetLevel` de l'étape précédente ≥ `requiredLevel`). On retient la position qui minimise `dist(précédent, bloc) + dist(bloc, suivant) − dist(précédent, suivant)`, en distance monde à vol d'oiseau via `C_Map.GetWorldPosFromMapPos`. **[choix Claude :** le vol d'oiseau suffit pour un calcul fait rarement. **]**
- Le résultat est mis en cache jusqu'au prochain changement d'option, de chaîne ou de donjon.

### 3.9 Onglet Quête
Maquette validée : `.superpowers/brainstorm/*/content/window-v3.html` (spec §6.1). Taille 270 × 262 (2 px de plus que la maquette, pour le pied de fenêtre).

```
 QUÊTE | Accès | Complétion
 ⚠ Hors route : niveau 14, route prévue 18   [Recaler]
 Étape en cours                      [Passer]
 Tuer 10 Vermines kobolds  ████░░  6/10
 Ensuite · Rendre « Nettoyage du camp » · 120 m
   Prendre « Loups des bois »
   Aller au maître de vol
 ─────────────
 Options ▸ (Élites, Donjons, Niveau max, Vol auto, Repère natif, Donjons ▾)
 Niv. 12 · étape 48/1 210 · reste ~96 h
```

- **Pied de fenêtre :** niveau, numéro d'étape et total, temps restant estimé (somme des `estCostSeconds` restants, valeurs du scénario moyen). L'XP/min mesurée viendra au Plan 3b. **[choix Claude]**
- Les options existantes restent, avec en plus la liste « Donjons ».
- Textes en frFR et enUS (clés `l10n` existantes plus les nouvelles).

### 3.10 Performance et robustesse
- **Décodage :** seulement au chargement et au changement de variante, hors combat. Si le joueur est en combat, il est différé à `PLAYER_REGEN_ENABLED`.
- **Calcul de l'étape en cours :** incrémental. On part de l'index précédent ; seul un événement de quête ou de niveau le fait avancer, ou le recalage.
- **Hors route :** au plus 15 calculs de trajet, une fois toutes les 2 s, au rythme du moteur actuel.
- **Erreurs :** chaque partie est isolée par `guard`. Une étape illisible (quête absente de QuestieDB, position non convertible) est sautée et comptée, avec un seul message ; elle ne bloque jamais la route.

## 4. Changements hors de l'add-on

- **Générateur** (`tools/route-builder/emit/emit.ts`) : ajoute `segmentRaces` au fichier. Régénère `data/routes/`.
- **`.pkgmeta`** : inclut `data/routes/*.lua` et exclut `data/routes/report.md`.
- **`MinMaxQuest_Camelot.toc`** : ajoute les deux fichiers de routes. C'est un changement visible du joueur : le README est mis à jour selon la règle du projet (Features : onglet Quête ; Roadmap : routes passent en Features).

## 5. Tests

- **Logique pure, en TypeScript** (vitest) :
  - composition de la route ;
  - règle « faite » de chaque type d'étape ;
  - étape en cours, hors route, recalage ;
  - insertion d'un bloc au moindre coût ;
  - passer une étape et ses suites.
- **Code compilé en Lua** (wasmoon, faux jeu existant) :
  - chargement des fichiers de routes ;
  - décodage d'une variante ;
  - mode actif suivant le dernier onglet ;
  - cible du moteur en mode Quête ;
  - bandeau Hors route et recalage.
- **Liste de vérification en jeu** (`docs/in-game-checklist.md`) complétée : suivi d'un segment de départ, changement de variante, chaîne d'Accès suivie, donjon coché.

## 6. Laissé au constructeur

- La structure interne des modules (`addon/src/route/…`), en respectant l'architecture du §3.2.
- Les noms exacts des clés `l10n` et des champs de sauvegarde, en suivant les conventions de `core/storage.ts`.
- Le détail du rendu de l'onglet, en suivant le thème existant (`ui/theme.ts`).
