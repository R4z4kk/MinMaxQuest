# MinMaxQuest — vérifications en jeu (plan 1)

Prérequis : `npm test` (construit `build/MinMaxQuest.lua`), puis lancer WoW Forever avec **QuestieDB** activé. `/console scriptErrors 1` pour voir les erreurs Lua.

## Chargement
- [ ] Aucune erreur au login ; `/dump MinMaxQuest.version` → `"0.1.0"`.
- [ ] `/mmq q 33` affiche nom, niveau, nombre d'objectifs (et la dernière erreur QuestieDB s'il y en a).
- [ ] QuestieDB désactivé : WoW refuse de charger MinMaxQuest (dépendance) — normal.

## Fenêtre
- [ ] `/mmq` ouvre/ferme la fenêtre ; onglets Quête | Accès | Complétion, la taille change par onglet ; position et onglet gardés après `/reload`.
- [ ] Rendu : fond noir, accent doré, Arial Narrow ; les petits symboles (✓, », ×, flèche ▾) s'affichent (pas de carrés). Vérifier aussi le tiret « — » quand une cible est injoignable.
- [ ] Textes en français sur client frFR (accents en majuscules : « RESTANT À PROXIMITÉ »).

## Complétion
- [ ] Liste triée par « ~temps » ; la flèche suit la première cible.
- [ ] Bascule Proximité / Zone ; le sélecteur de zone liste les zones et filtre.
- [ ] Filtres Grises / Élites ; aucune quête bloquée n'apparaît.
- [ ] Les objectifs « tuer X » : la flèche parcourt les points du groupe de mobs et passe au suivant à ~25 m.
- [ ] Les donneurs de l'autre faction ne sont pas proposés.

## Flèche
- [ ] `/mmq arrow test` : pointe vers le haut face au nord, tourne dans le bon sens quand on pivote (si elle tourne à l'envers, le signe de rotation est inversé).
- [ ] Cachée en instance, cachée en vol (griffon), réapparaît à l'atterrissage.
- [ ] `/mmq arrow move` → glisser → `/mmq arrow lock` ; position gardée après `/reload`.
- [ ] `/framerate` stable fenêtre ouverte.

## Passer / épingler
- [ ] « Passer » sur une quête avec suites → dialogue avec la liste et l'XP perdue ; sans suite → passée directement.
- [ ] `/mmq skipped` liste les quêtes passées ; `/mmq unskip <id>` / `/mmq unskip all` les réactive.
- [ ] Journal de quêtes : petit losange à droite de chaque quête ; clic → épinglée (la flèche et la fenêtre basculent, ligne « Épinglée · × ») ; re-clic ou × → automatique. Les losanges restent alignés en faisant défiler le journal (sinon : décalage d'index à corriger).
- [ ] Pas d'entrée MinMaxQuest dans `Logs\taint.log` après un combat (`/console taintLog 1`).

## Trajets et griffons
- [ ] Parler à un maître de vol enregistre les points connus ; une cible lointaine fait passer la flèche par le maître de vol.
- [ ] Vol automatique vers la bonne destination ; Maj enfoncée → pas de décollage ; option décochée (onglet Quête) → pas de décollage ; destination inconnue → message, pas de décollage.
- [ ] Après avoir lié la pierre de foyer puis utilisée, la route peut proposer « Utilise ta pierre de foyer ».

## Accès
- [ ] `/mmq chain 92432` affiche la chaîne des Égouts de Dalaran ; l'onglet Accès montre la progression et la case « Suivre dans la route ».

## Carte
- [ ] Carte du monde : 2 marqueurs seulement (étape actuelle et suivante) ; minicarte : l'étape actuelle ; info-bulle « +N autres zones ».
- [ ] Repère Blizzard posé pour l'étape actuelle (option cochée) ; un repère posé à la main par toi n'est jamais effacé.

## Données et performance
- [ ] `/mmq debug build 1` → bandeau « Données générées pour le build … » (n'empêche rien).
- [ ] `/mmq debug prof` : durée du dernier recalcul (viser < 10 ms) et du premier au login (signaler si > 50 ms).
- [ ] Mémoire après 10 min : `/run UpdateAddOnMemoryUsage() print(GetAddOnMemoryUsage("MinMaxQuest"))` < 5 Mo.

## À signaler si constaté
- Objectif visé déjà terminé (ordre des objectifs différent du jeu).
- Paliers de monture (40 / 60) ou vitesse différents sur Forever.
- Une pierre de foyer liée ailleurs ignorée tant que tu restes immobile (limite connue : il faut bouger de 10 m).
