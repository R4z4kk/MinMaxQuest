# MinMaxQuest — vérifications en jeu (plan 1)

Prérequis : `npm test` (construit `build/MinMaxQuest.lua`), puis lancer WoW Forever avec **QuestieDB** activé. `/console scriptErrors 1` pour voir les erreurs Lua.

## Chargement
- [ ] Aucune erreur au login ; `/dump MinMaxQuest.version` → `"0.2.0-beta.2"`.
- [ ] `/mmq q 33` affiche nom, niveau, nombre d'objectifs (et la dernière erreur QuestieDB s'il y en a).
- [ ] QuestieDB désactivé : WoW refuse de charger MinMaxQuest (dépendance) — normal.

## Fenêtre
- [ ] `/mmq` affiche/cache ensemble la fenêtre, la flèche et le bouton d'objet ; onglets Quête | Accès | Complétion, taille fixe 320 × 480 ; position et onglet gardés après `/reload`.
- [ ] Rendu : fond violet, accent doré, Arial Narrow et Friz Quadrata ; les petits symboles (✓, », ×, flèche ▾) s'affichent (pas de carrés). Vérifier aussi le tiret « — » quand une cible est injoignable.
- [ ] Bouton œil (à gauche de l'engrenage) : cache fenêtre, flèche, bouton d'objet, repères carte/minicarte et vol auto ; état gardé après `/reload` ; `/mmq` fait tout revenir ; un repère posé à la main n'est pas effacé ; l'icône s'affiche (pas de carré vide).
- [ ] Textes en français sur client frFR (accents corrects : « À rendre », « Étape en cours »).
- [ ] Option Langue (Auto / English / Français) : le texte change ; un bouton « Recharger » apparaît si nécessaire et recharge l'interface ; les noms de quêtes, PNJ et zones suivent toujours la langue du client.

## Look BetterBags
- [ ] Titre « MinMaxQuest » et en-têtes de section en Friz Quadrata, avec compteur et fine ligne jusqu'au bord.
- [ ] Toutes les icônes de type visibles (« ! », « ? », tuer, collecter, vol, pierre de foyer, coche, « » ») : aucun carré vert.
- [ ] Panneau violet sombre, onglets avec soulignement doré.
- [ ] Fenêtre en 320 × 480 sur chaque onglet, en frFR comme en enUS.
- [ ] Complétion : sections À rendre / Objectifs / À prendre (vides cachées), ligne de la cible surlignée avec « » et toujours visible dans une longue liste.
- [ ] Accès : sections repliables avec fait / total, icône d'entrée (fait, en cours, intact), niveau à droite ou barre dorée quand commencée.
- [ ] Quête : sections « Étape en cours » et « Ensuite » avec icônes, Options et Donjons repliables, une seule ouverte à la fois.
- [ ] Fenêtres annexes (sélecteur de zone, confirmation de saut, bandeau de version) dans la même palette.

## Complétion
- [ ] Liste triée par « ~temps » ; la flèche suit la ligne surlignée dans les sections.
- [ ] Sous-onglets Proximité | Zone | Journal (même style que Quête / Accès / Complétion) : un clic change de mode ; le sélecteur de zone n'apparaît qu'en mode Zone, il liste les zones et filtre.
- [ ] Proximité : seulement la zone actuelle et les zones voisines (plus de liste du continent entier) ; les compteurs des sections suivent ; une quête de donjon prise chez un PNJ d'une zone voisine apparaît.
- [ ] Pierre de foyer en Complétion : proposée seulement si elle fait gagner ~15 min ; le temps affiché ne compte pas la pénalité.
- [ ] Filtres Grises / Élites ; aucune quête bloquée n'apparaît.
- [ ] Les objectifs « tuer X » : la flèche parcourt les points du groupe de mobs et passe au suivant à ~25 m.
- [ ] Objectif « tuer / collecter » : la flèche boucle sur les points (25 max, à 250 m) et recommence jusqu'à la fin de l'objectif ; le repère carte et minicarte suit le point courant. Idem en mode Quête.
- [ ] Les donneurs de l'autre faction ne sont pas proposés.
- [ ] Mode Journal : seules les quêtes du journal sont ciblées (objectifs et rendus, triés par temps de trajet) ; filtres Grises/Élites et zone ignorés ; en-tête sans chevauchement, en frFR comme en enUS.

## Flèche
- [ ] `/mmq arrow test` : pointe vers le haut face au nord, tourne dans le bon sens quand on pivote (si elle tourne à l'envers, le signe de rotation est inversé).
- [ ] Cachée en instance, cachée en vol (griffon), réapparaît à l'atterrissage.
- [ ] `/mmq arrow move` → glisser → `/mmq arrow lock` ; position gardée après `/reload`.
- [ ] `/framerate` stable fenêtre ouverte.
- [ ] Aucun cadre ni poignée autour de la flèche, ni au survol ni pendant le déplacement.
- [ ] Glisser la flèche au clic gauche quand elle est déverrouillée ; case « Verrouiller la flèche » (ou `/mmq arrow lock`) → clics traversants ; le libellé de la flèche est blanc ; position gardée après `/reload`.
- [ ] Mort au corps : flèche cachée sans message ; après libération (fantôme) : elle pointe vers le cadavre, quelle que soit la cible ; position inconnue : cachée avec un message unique.
- [ ] Bouton d'objet de quête : visible à droite de la flèche quand la quête visée a un objet utilisable ; un clic = une utilisation ; icône, compteur, recharge et info-bulle corrects ; fonctionne en modes Quête et Complétion.
- [ ] Bouton d'objet : cliquer-glisser l'icône le déplace sans utiliser l'objet (flèche déverrouillée, hors combat) ; un simple clic l'utilise une seule fois ; position gardée après `/reload` ; « Verrouiller la flèche » le verrouille aussi.
- [ ] Bouton d'objet : changer d'objet, verrouiller, ou cacher/afficher (`/mmq`, œil) en combat n'est appliqué qu'à la fin du combat (aucune erreur de taint).

## Passer / épingler
- [ ] Clic sur une ligne (Complétion, « Suivant » de Quête, étape de quête ou entrée dépliée d'Accès) → la flèche cible cette quête, nom en doré dans Quête / Accès ; re-clic → automatique ; clic sur l'étape courante (Quête) → automatique.
- [ ] « Passer » sur une quête avec suites → dialogue avec la liste et l'XP perdue ; sans suite → passée directement.
- [ ] `/mmq skipped` liste les quêtes passées ; `/mmq unskip <id>` / `/mmq unskip all` les réactive.
- [ ] Journal de quêtes : petit losange à droite de chaque quête ; clic → épinglée (la flèche et la fenêtre basculent, ligne « Épinglée · × ») ; re-clic ou × → automatique. Les losanges restent alignés en faisant défiler le journal (sinon : décalage d'index à corriger).
- [ ] Pas d'entrée MinMaxQuest dans `Logs\taint.log` après un combat (`/console taintLog 1`).

## Trajets et griffons
- [ ] Parler à un maître de vol enregistre les points connus ; une cible lointaine fait passer la flèche par le maître de vol.
- [ ] À Darnassus, avec une cible vers Rut'theran ou plus loin, la flèche dit « Prends le portail » et mène au portail violet avant le maître de vol (et inversement à Rut'theran).
- [ ] Depuis le Repaire des Grumegueules, avec une cible au mont Hyjal et les points de vol connus : la flèche envoie au maître de vol, pas à pied vers Hyjal.
- [ ] Vol automatique vers la bonne destination ; Maj enfoncée → pas de décollage ; option décochée (onglet Quête) → pas de décollage ; destination inconnue → message, pas de décollage.
- [ ] Après avoir lié la pierre de foyer puis utilisée, la route peut proposer « Utilise ta pierre de foyer ».

## Accès
- [ ] `/mmq chain 92432` affiche la chaîne des Égouts de Dalaran ; l'onglet Accès montre la progression et la case « Suivre dans la route ».
- [ ] Onglet Accès : 4 groupes repliables (Donjons, Raids, Clés, Divers) avec « fait/total » ; seules les entrées de ta faction sont listées.
- [ ] Cliquer une entrée déplie ses étapes : faites barrées et grisées, étape courante marquée » ; niveaux et progression corrects.
- [ ] Noms affichés : quêtes, objets, PNJ et objets de monde (Tuer / Parler à / Utiliser) ; les noms d'objets apparaissent après un court chargement.
- [ ] « Suivre dans la route » insère les quêtes de l'entrée dans la route, sans doublon.
- [ ] La liste défile à la molette ; les noms suivent la langue choisie (enUS / frFR).

## Carte
- [ ] Carte du monde : 2 marqueurs seulement (étape actuelle et suivante) ; minicarte : l'étape actuelle ; info-bulle « +N autres zones ».
- [ ] Repère Blizzard posé pour l'étape actuelle (option cochée) ; un repère posé à la main par toi n'est jamais effacé.
- [ ] Épingles : goutte dorée (jaune des quêtes, pas le doré de la fenêtre), contour sombre et ombre portée ; aucun carré vert (texture manquante).
- [ ] Numéros : « 1 » sur l'étape actuelle, « 2 » sur la suivante, lisibles dans le disque sombre ; la pointe de la goutte tombe pile sur le lieu visé.
- [ ] L'épingle 1 est plus grande que la 2 et son halo pulse en boucle ; pas de halo sur la 2 ; le halo s'arrête quand l'épingle disparaît.
- [ ] Badge « ! » (quête à prendre) ou « ? » (quête à rendre) en haut à droite de l'épingle, numéro conservé ; aucun badge sur un objectif.
- [ ] Minicarte : épingle numérotée de l'étape actuelle avec halo, info-bulle au survol (zone haute de la goutte seulement).
- [ ] Zone de farm (objectif tuer/collecter avec 3 points ou plus) : contour en tirets dorés qui épouse les points, pas un cercle ; rien pour 1 ou 2 points.
- [ ] Zone de farm : un halo doux sur chaque point d'apparition, sur la carte du monde et sur la minicarte (pas de contour sur la minicarte).
- [ ] Zone de farm : étiquette « Nom x/y » au-dessus de la zone ; le compteur suit les kills.
- [ ] Zone de farm : redessinée en changeant de carte (zone → continent → zone) et à l'ouverture de la carte ; rien sur une carte qui ne contient pas les points ; tirets et étiquette sous les épingles, pas au-dessus des menus.
- [ ] Bouton œil : épingles, halos, zone de farm et halos de minicarte disparaissent et reviennent avec `/mmq`.
- [ ] Ouvrir la carte en combat avec une zone de farm affichée : aucune erreur ni taint.

## Routes (onglet Quête)
- [ ] Niveau 1 humain : suivre le segment d'Elwynn ; la flèche suit l'étape affichée et passe à la suivante.
- [ ] Changer de variante (élites, donjons, niveau max) : la route est recalculée sans erreur.
- [ ] Suivre la chaîne des Égouts de Dalaran (onglet Accès) : ses étapes entrent dans la route.
- [ ] Cocher un donjon : l'étape de retour est insérée.
- [ ] Sortir de la route (niveau très différent) puis « Re-sync » : le bandeau disparaît et l'étape est recalée.
- [ ] Les onglets Complétion et Quête basculent la flèche entre les deux modes.
- [ ] `/mmq debug prof` en mode Quête sur un vrai personnage : noter les durées de recalcul (coût du suivi de route non mesuré en jeu).

## Métiers
- [ ] « Le philtre d'amour » (4201) sans Herboristerie : l'objectif Gromsang affiche « Achète Gromsang ×N à l'hôtel des ventes » et la flèche vise le commissaire-priseur le plus proche, pas Gangrebois ; avec Herboristerie (apprise sans /reload), elle vise les Gromsang.

## Shortest Path Forever (optionnel)
- [ ] Sans l'addon : rien ne change, aucune erreur.
- [ ] Avec l'addon, cible à pied mais le chemin direct passe par une montagne ou un tunnel : la flèche indique le maître de vol (ou le bateau, le portail) au lieu de la marche ; un trajet à pied simple reste à pied.
- [ ] En combat ou pendant un écran de chargement : la flèche ne change pas et aucun message n'apparaît.

## Données et performance
- [ ] `/mmq debug build 1` → bandeau « Données générées pour le build … » (n'empêche rien).
- [ ] `/mmq debug prof` : durée du dernier recalcul (viser < 10 ms) et du premier au login (signaler si > 50 ms).
- [ ] Mémoire après 10 min : `/run UpdateAddOnMemoryUsage() print(GetAddOnMemoryUsage("MinMaxQuest"))` < 5 Mo.

## À signaler si constaté
- Objectif visé déjà terminé (ordre des objectifs différent du jeu).
- Paliers de monture (40 / 60) ou vitesse différents sur Forever.
