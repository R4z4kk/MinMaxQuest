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
- [ ] Option Langue (Auto / English / Français) : le texte change ; un bouton « Recharger » apparaît si nécessaire et recharge l'interface ; les noms de quêtes, PNJ et zones suivent toujours la langue du client.

## Complétion
- [ ] Liste triée par « ~temps » ; la flèche suit la première cible.
- [ ] Bascule Proximité / Zone ; le sélecteur de zone liste les zones et filtre.
- [ ] Filtres Grises / Élites ; aucune quête bloquée n'apparaît.
- [ ] Les objectifs « tuer X » : la flèche parcourt les points du groupe de mobs et passe au suivant à ~25 m.
- [ ] Les donneurs de l'autre faction ne sont pas proposés.
- [ ] Mode Journal : seules les quêtes du journal sont ciblées (objectifs puis remises) ; filtres Grises/Élites et zone ignorés ; en-tête sans chevauchement, en frFR comme en enUS.

## Flèche
- [ ] `/mmq arrow test` : pointe vers le haut face au nord, tourne dans le bon sens quand on pivote (si elle tourne à l'envers, le signe de rotation est inversé).
- [ ] Cachée en instance, cachée en vol (griffon), réapparaît à l'atterrissage.
- [ ] `/mmq arrow move` → glisser → `/mmq arrow lock` ; position gardée après `/reload`.
- [ ] `/framerate` stable fenêtre ouverte.
- [ ] Glisser la flèche au clic gauche quand elle est déverrouillée ; case « Verrouiller la flèche » (ou `/mmq arrow lock`) → clics traversants ; le libellé de la flèche est blanc ; position gardée après `/reload`.
- [ ] Mort au corps : flèche cachée sans message ; après libération (fantôme) : elle pointe vers le cadavre, quelle que soit la cible ; position inconnue : cachée avec un message unique.
- [ ] Bouton d'objet de quête : visible à droite de la flèche quand la quête visée a un objet utilisable ; un clic = une utilisation ; icône, compteur, recharge et info-bulle corrects ; fonctionne en modes Quête et Complétion.
- [ ] Bouton d'objet : glisser par la fine bordure dorée (flèche déverrouillée, hors combat) ; position gardée après `/reload` ; « Verrouiller la flèche » le verrouille aussi.
- [ ] Bouton d'objet : changer d'objet ou verrouiller en combat n'est appliqué qu'à la fin du combat (aucune erreur de taint).

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

## Routes (onglet Quête)
- [ ] Niveau 1 humain : suivre le segment d'Elwynn ; la flèche suit l'étape affichée et passe à la suivante.
- [ ] Changer de variante (élites, donjons, niveau max) : la route est recalculée sans erreur.
- [ ] Suivre la chaîne des Égouts de Dalaran (onglet Accès) : ses étapes entrent dans la route.
- [ ] Cocher un donjon : l'étape de retour est insérée.
- [ ] Sortir de la route (niveau très différent) puis « Re-sync » : le bandeau disparaît et l'étape est recalée.
- [ ] Les onglets Complétion et Quête basculent la flèche entre les deux modes.
- [ ] `/mmq debug prof` en mode Quête sur un vrai personnage : noter les durées de recalcul (coût du suivi de route non mesuré en jeu).

## Données et performance
- [ ] `/mmq debug build 1` → bandeau « Données générées pour le build … » (n'empêche rien).
- [ ] `/mmq debug prof` : durée du dernier recalcul (viser < 10 ms) et du premier au login (signaler si > 50 ms).
- [ ] Mémoire après 10 min : `/run UpdateAddOnMemoryUsage() print(GetAddOnMemoryUsage("MinMaxQuest"))` < 5 Mo.

## À signaler si constaté
- Objectif visé déjà terminé (ordre des objectifs différent du jeu).
- Paliers de monture (40 / 60) ou vitesse différents sur Forever.
