# MinMaxQuest — Conception

Date : 2026-11-27 · Statut : brouillon à valider · Jeu : World of Warcraft: Forever (client 1.60.1, build 71139, Interface 16001, produit `wowf`)

Recherche de référence : [`reports/Optimisation des routes de leveling.md`](../../../reports/Optimisation%20des%20routes%20de%20leveling.md) et les notes dans `research_notes/Optimisation des routes de leveling/` (dont `missing_data_sources.md` et `quest_completion_time.md`).

> Marqueur **[choix Claude]** = décision prise par moi, pas encore validée explicitement par l'utilisateur. Le reste a été décidé avec lui.

---

## 1. Intention

Un seul add-on, bien pensé, qui remplace Questie (carte), RestedXP (routes) et Attune (accès). Le besoin de fond : **être guidé sans réfléchir**.
- Une flèche à l'écran mène à l'endroit exact : objet, PNJ, zone de mobs.
- Pour les objectifs du type « tuer X mobs », la flèche fait suivre une boucle optimisée entre les points d'apparition.
- La route de leveling est vraiment optimisée, mieux que les guides écrits à la main, et elle reste utilisable quand le joueur s'en écarte.
- La carte reste lisible : pas 5 points d'exclamation pour un seul objectif.
- L'interface est moderne, sobre, polie, légère et performante.

Pourquoi maintenant : Forever est sorti le 4 novembre 2026. Les données changent presque tous les jours, aucun outil ne réoptimise la route quand le joueur dévie, et l'interface d'Attune est jugée vieillotte.

## 2. Objectifs, non-objectifs, anti-objectifs

**Objectifs**
- 3 onglets dans une seule fenêtre, dans cet ordre : **Quête**, **Accès**, **Complétion**.
- Une flèche personnalisée, déplaçable et verrouillable.
- Des routes précalculées et optimisées (XP par minute) **du niveau 1 au niveau 60**, pour chaque faction. Seul le début de la route dépend de la zone de départ ; ensuite, la route est commune à toute la faction (§7.4).
- Rester utile **après le niveau 60** : Complétion et Accès fonctionnent à tous les niveaux.
- Des mises à jour très fréquentes : régénération quotidienne automatique.
- Coût d'affichage quasi nul hors de la flèche, aucune chute de FPS.

**Non-objectifs (v1)**
- Des routes par classe : une seule route par faction et zone de départ. Les variantes viendront plus tard.
- Le grind en AoE.
- La recherche de groupe : élites et donjons sont des options de route (§7.5), mais l'add-on ne forme pas de groupe.
- Les métiers, et toute version de WoW autre que Forever.
- Le machine learning : écarté, voir la recherche, §2 du rapport.

**Anti-objectifs (échec même si « ça marche »)**
- Une route rigide qui casse dès que le joueur dévie, comme RXP ou Zygor.
- Une carte surchargée de marqueurs.
- Des données périmées utilisées en silence.
- Des à-coups ou des chutes de FPS, des erreurs Lua, un « taint » de l'interface Blizzard.

## 3. Contraintes

- **Pas d'accès à Internet en jeu.** La mise à jour passe par une nouvelle version de l'add-on publiée.
- **Licence GPL-3.0**, validée par l'utilisateur. Les données de QuestieDB et de Shortest Path Forever sont sous GPL-3.0.
- **Langage.** TypeScript partout, pour respecter la règle de l'utilisateur. L'add-on est compilé en Lua avec **TypeScriptToLua** (TSTL). Pas de `any` ni de `undefined` explicites : on utilise des types optionnels stricts. Tout le code, les noms et les commentaires sont en anglais, avec des commentaires minimaux.
- **Gestion d'erreur robuste.** Une donnée de jeu manquante ou corrompue produit un message visible et désactive la fonction concernée, jamais une erreur Lua en boucle.
- **Données qui bougent** (XP, vitesses, temps de vol, numéro de build) :
  - chaque valeur cite sa source et porte sa date ;
  - le générateur de routes refuse de calculer si une constante a expiré ;
  - un test en CI échoue à l'expiration pour rappeler de la renouveler.
- **Restrictions de l'API WoW**, héritées de Midnight. Aucune fenêtre protégée n'est touchée en combat. Il faut prévoir les « secret values » et le cas où `GetPlayerFacing()` renvoie `nil` en instance.

## 4. Approches envisagées pour les routes

| | Approche | Points forts | Limites |
|---|---|---|---|
| A | Calcul dans le jeu depuis l'état réel | S'adapte au journal réel | Qualité limitée par le CPU en jeu, distances grossières |
| **B** | **Routes précalculées hors jeu, livrées dans l'add-on** | **Meilleure qualité, coût nul en jeu** | **Rigide si le joueur dévie** |
| C | Hybride : coûts précalculés + calcul dans le jeu | Le meilleur des deux | Deux systèmes à construire |

**Choix de l'utilisateur : B.** Sa raison : les données (disponibilité des quêtes, niveaux, XP, XP par niveau, temps de trajet) permettent de calculer des routes optimales hors du jeu. La rigidité est compensée par un **suivi de route tolérant** dans le jeu (§6.2), qui ne recalcule pas la route.

## 5. Architecture

```
MinMaxQuest/                    (dépôt, GPL-3.0)
├─ addon/                       TypeScript → Lua (TSTL)
│   ├─ src/core/                événements, état du joueur, sauvegarde
│   ├─ src/route/               suivi de route, insertion des chaînes d'Accès
│   ├─ src/targets/             cibles Complétion (proximité/zone)
│   ├─ src/arrow/               flèche personnalisée
│   ├─ src/map/                 marqueurs carte et minicarte
│   ├─ src/taxi/                vol automatique
│   ├─ src/telemetry/           mesures de temps (calibrage)
│   └─ src/ui/                  fenêtre à onglets, dialogue « Passer »
├─ data/access/                 chaînes d'Accès maintenues à la main (JSON validé par schéma)
├─ tools/route-builder/         générateur hors jeu (TypeScript / Node)
│   ├─ ingest/                  QuestieDB, CSV wago.tools, Shortest Path Forever, cmangos
│   ├─ model/                   constantes datées, formules XP, coûts
│   ├─ sim/                     simulateur de leveling déterministe
│   ├─ opt/                     beam search puis ALNS
│   └─ emit/                    génère les fichiers Lua de routes
└─ .github/workflows/           régénération quotidienne et publication
```

Sortie dans le jeu : l'add-on principal `MinMaxQuest` (Interface 16001, TOC `MinMaxQuest_Forever.toc`) et deux add-ons de données **chargés à la demande**, `MinMaxQuest_Routes_Alliance` et `MinMaxQuest_Routes_Horde`. Seul celui de la faction du personnage est chargé. Dépendance obligatoire : **QuestieDB** (données). Questie lui-même n'est pas requis. **[choix Claude]**

## 6. L'add-on en jeu

### 6.1 Fenêtre unique

Maquettes validées : `.superpowers/brainstorm/*/content/window-v3.html` et `completion-v1.html`.

- **Style :**
  - fond noir presque opaque `rgba(8,8,9,.93)`, bordure 1 px `rgba(255,255,255,.07)` ;
  - textes `#e6e6e6` et secondaires `#8b8b8b` ;
  - **une seule couleur d'accent, doré sobre `#c9a75a`**, utilisée pour la flèche, les barres, l'onglet actif et le titre ;
  - police **Arial Narrow** du jeu (`Fonts\ARIALN.TTF`), aucun fichier de police livré.
- **Fenêtre :**
  - onglets **Quête | Accès | Complétion**, Quête par défaut ;
  - la fenêtre change de taille au clic d'onglet (Accès est plus grand) ;
  - fenêtre déplaçable ; position et onglet sauvegardés par personnage.
- **Onglets Quête et Complétion :**
  - « Étape en cours » avec sa barre de progression et un bouton **Passer** ;
  - « Étape suivante » mise en avant avec sa distance, puis deux étapes plus discrètes ;
  - un pied de fenêtre qui varie selon l'onglet.
- **Épingler une quête, depuis le journal de quêtes du jeu :**
  - un petit bouton 📌 est ajouté à droite de chaque quête dans le journal Blizzard (`QuestLogFrame`) ;
  - un clic dessus fixe la flèche et l'étape en cours de MinMaxQuest sur cette quête ;
  - dans la fenêtre MinMaxQuest, une ligne « Épinglée · ✕ » apparaît, et le ✕ (ou un nouveau clic sur le 📌) rend la main à l'automatique ;
  - retour automatique à l'automatique quand la quête épinglée est terminée ;
  - une seule quête épinglée à la fois **[choix Claude]** ;
  - les boutons sont créés une fois, hors combat, sans modifier les fonctions Blizzard : on utilise uniquement `hooksecurefunc` pour éviter le taint ;
  - pas de bouton d'épinglage dans la fenêtre MinMaxQuest.
- **Passer une étape :**
  - si la quête est un prérequis d'une suite, une fenêtre de confirmation liste les suites perdues, l'XP perdue et sa part de niveau, avec **Annuler** et **Passer quand même** ;
  - sinon, l'étape est passée directement ;
  - une étape passée est retenue par personnage et peut être réactivée depuis les réglages ;
  - une élite ou une quête de donjon passée se passe de la même façon : le suivi de route comble alors le manque d'XP avec du grind, en prenant l'étape `grind` la plus proche dans la route de base.
- **Options de route (onglet Quête) :**
  - deux cases, **Inclure les élites** et **Inclure les donjons**, décochées par défaut **[choix Claude]** ;
  - **Niveau de quête maximum** (décidé par l'utilisateur, désactivé par défaut) : « N'accepter que les quêtes d'au moins X niveaux de moins que moi », avec X = 1, 2 ou 3. Exemple : un guerrier niveau 15 avec X = 2 ne prend que des quêtes de niveau 13 ou moins. Le but est d'éviter les mobs trop durs pour les classes fragiles en début de partie ;
  - changer une option charge la variante de route correspondante (§7.5), puis le suivi tolérant se recale dessus ;
  - l'option de niveau maximum filtre aussi les cibles de l'onglet Complétion.
- **Langues :** textes de l'interface en frFR et enUS. Les noms de quêtes viennent du client (`C_QuestLog.GetTitleForQuestID`), avec repli sur QuestieDB.

### 6.2 Onglet Quête (route précalculée)

- **Chargement :**
  - la route de la faction, du niveau 1 au niveau 60 : d'abord le segment de départ propre à la zone de départ du personnage, puis le tronc commun (§7.4) ;
  - si la zone de départ est inconnue, ou si le personnage a déjà dépassé le segment de départ, on se place directement à l'étape du tronc la plus proche de son niveau et de sa position ;
  - **au niveau 60**, la route est terminée : l'onglet le signale et propose de passer en Complétion.
- **Suivi tolérant, sans recalcul global :**
  - **Une étape déjà faite est sautée.** On le détecte avec `C_QuestLog.IsQuestFlaggedCompleted`, le journal de quêtes, les objectifs et le point de vol connu.
  - **Hors route :** si le joueur est loin de l'étape attendue, la flèche le ramène vers l'étape suivante la plus proche dans une fenêtre des N prochaines étapes **[choix Claude : N = 15]**.
  - **Bandeau « Hors route »** quand le niveau du joueur s'écarte de plus de 3 niveaux du niveau prévu à cette étape **[choix Claude]**. Un clic se recale à l'étape de la route la plus proche de son niveau et de sa position.
  - **Une étape passée** retire aussi ses suites, comme indiqué dans le dialogue.
- **Insertion des chaînes d'Accès suivies :**
  - Chaque étape d'une chaîne cochée « Suivre dans la route » est insérée à la position la moins coûteuse, en utilisant `estCostSeconds` et la distance entre les étapes voisines.
  - C'est le seul calcul de route fait dans le jeu. Il est lancé uniquement quand on coche ou décoche une chaîne, ou au chargement.
- **Étape « tuer ou récupérer » :**
  - la flèche parcourt les points d'apparition du **groupe de mobs choisi hors jeu**, dans l'ordre d'une boucle précalculée ;
  - elle passe au point suivant à moins de 25 m **[choix Claude]** ;
  - elle s'arrête dès que l'objectif est rempli.
- **Pied de fenêtre :** niveau, XP/min mesurée, chaîne d'Accès suivie.

### 6.3 Onglet Accès

- **Contenu :**
  - une liste des donjons, raids et clés de Forever avec leur barre de progression ;
  - chaque ligne se déplie pour montrer la chaîne : étapes faites barrées, étape en cours ▸ avec sa position, étapes à venir ;
  - une case **« Suivre dans la route »** par chaîne, plusieurs chaînes possibles en même temps ;
  - pied de fenêtre : mode actif et nombre de chaînes suivies.
- **Données :** fichier `data/access/*.json` maintenu à la main et validé par un schéma. Chaque chaîne contient l'ID de l'instance ou de l'objet clé, les étapes (questId, ou objet à obtenir) et le niveau conseillé. Source de départ :
  - les chaînes de QuestieDB (`preQuestSingle`, `nextQuestInChain`) ;
  - le contenu connu de Forever : Dalaran Sewer Key (quête 92432), Tome of Dalaran, Amulette Feu-drake d'Onyxia, nouveaux donjons.

  Toute modification est validée par un humain. On ne copie pas les données d'Attune tant que sa licence n'est pas vérifiée.
- **Contenu au 9 décembre :** les raids Barrow Deeps et Hyjal Summit n'ont pas d'accès annoncé. On les ajoutera s'il y en a un.

### 6.4 Onglet Complétion

- **Pas de route :** la flèche va vers la cible disponible la plus proche, quel que soit le niveau. Une cible est une quête à prendre, un objectif ou un rendu.
- **Deux réglages :**
  - **Proximité** (par défaut) : toutes zones et tous continents confondus, triés par **temps de trajet réel** (décidé par l'utilisateur), calculé avec le graphe de trajet du §6.4.1. La valeur affichée est ce temps (« ~2 min ») avec la distance à côté.
  - **Zone :** limité à la zone choisie avec « Zone ▾ ».
- **Contenu de l'onglet :**
  - en-tête de zone avec quêtes faites sur le total et barre de progression (zone actuelle en Proximité, zone choisie en Zone) ;
  - « Cible la plus proche », « Ensuite », puis « Restant », triée par distance avec le niveau de chaque quête ;
  - filtres : **Grises** et **Élites**, affichées ou masquées ;
  - **les quêtes bloquées ne sont jamais affichées**, ni dans la liste ni dans les filtres ;
  - pied de fenêtre : progression du continent et progression totale.
- **Calcul :** la liste des cibles est recalculée sur les événements de quête et de changement de zone. Le tri par temps de trajet est mis à jour au plus toutes les 2 s **[choix Claude]**.

#### 6.4.1 Graphe de trajet en jeu

- **Nœuds :**
  - relais de griffon, à partir de TaxiNodes, des temps de Shortest Path Forever, et des seuls relais connus du personnage, enregistrés à chaque ouverture de carte de vol ;
  - quais de bateaux et de zeppelins, avec attente moyenne = demi-période + durée du trajet ;
  - point de la pierre de foyer, si elle est disponible.
  
  En tout, environ 150 nœuds, livrés comme données précalculées dans l'add-on.
- **Marche entre deux points :** distance en ligne droite × un facteur de détour (constante datée, environ 1,25 au départ), divisée par la vitesse du personnage (à pied ou en monture selon son niveau et sa monture).
- **Calcul :**
  - un Dijkstra part de la position du joueur, au plus une fois toutes les 2 s ou à chaque changement de zone ;
  - il donne le temps jusqu'à chaque nœud, et le temps d'une cible est le minimum, sur les nœuds, de (temps jusqu'au nœud + marche du nœud à la cible) ;
  - avec environ 150 nœuds, le coût reste négligeable.
- **Contournement d'obstacles :** pas de navmesh en v1, seulement le facteur de détour **[choix Claude]**. Le navmesh de Shortest Path Forever est une évolution possible si le facteur se révèle trop imprécis.
- **Réutilisation :** le même graphe sert à la flèche. Quand le meilleur trajet passe par un griffon ou un bateau, la flèche pointe d'abord vers le maître de vol ou le quai, et le vol automatique (§6.7) prend le relais.

### 6.5 Flèche

- **Rendu :**
  - un cadre personnalisé : une texture de flèche dorée qu'on fait tourner (`SetRotation`), avec la distance et le libellé de l'objectif en dessous ;
  - l'angle est calculé à partir de `C_Map.GetPlayerMapPosition`, des coordonnées monde (`C_Map.GetWorldPosFromMapPos`) et de `GetPlayerFacing()`.
- **Déplacement :**
  - un mode « déplacer » montre un contour en pointillés et une poignée ⠿ ;
  - on verrouille la flèche ensuite, et sa position est sauvegardée par personnage.
- **Performance :**
  - mise à jour dans `OnUpdate` limitée à 30 fois par seconde **[choix Claude]** ;
  - aucune allocation de table dans la boucle ;
  - masquée si la cible est inconnue ou si `GetPlayerFacing()` vaut `nil` (instance).
- **Repère natif en complément :** `C_Map.SetUserWaypoint` et `C_SuperTrack.SetSuperTrackedUserWaypoint(true)` posent le repère Blizzard sur la carte. Désactivable.

### 6.6 Carte et minicarte

- **Cartes concernées :** seulement l'**étape en cours** et l'**étape suivante**.
- **Un seul marqueur par objectif :** le centre du groupe de mobs choisi, et non tous les points d'apparition. Les autres groupes apparaissent au survol du marqueur.
- **Bibliothèque :** HereBeDragons-2.0 et HereBeDragons-Pins, à condition que leur licence permette de les intégrer **[à vérifier par le développeur]**. Sinon, marqueurs posés à la main avec les API `C_Map`.

### 6.7 Vol automatique

- **Déclenchement :** sur `TAXIMAP_OPENED`, si l'étape en cours est « Griffon vers X ».
- **Fonctionnement :** on cherche l'index dont `TaxiNodeName(i)` correspond à X, puis on appelle `TakeTaxiNode(i)`, comme RXP le fait (`RXPGuides\functions.lua:2885`).
- **Exceptions :**
  - **Maj enfoncée** : pas de décollage automatique ;
  - **option** pour couper complètement le vol automatique ;
  - **destination introuvable** ou pas encore découverte : message visible, pas de décollage, et l'étape est marquée à refaire à pied.
- **Correspondance des noms :** par l'ID du relais (TaxiNodes) quand l'API le permet, sinon par le nom localisé.

### 6.8 Télémétrie locale (calibrage)

- **Enregistrement :**
  - prise et rendu de quête avec l'heure, l'XP et le niveau ;
  - première progression et fin de chaque objectif ;
  - kills (`PARTY_KILL`) reliés aux variations des objectifs ;
  - temps actif, coupé à la déconnexion et après 5 min sans activité ;
  - position toutes les 2 s ;
  - si le joueur est en groupe ou sur une monture ;
  - écart entre son niveau et celui de la quête.
- **Filtrage :** seules les périodes **en solo** servent au calibrage.
- **Stockage :** uniquement en local, dans les SavedVariables du compte, sans envoi nulle part. Taille limitée : on garde les N dernières sessions, on supprime les plus anciennes.
- **Utilisation :** le générateur de routes peut lire ce fichier si l'utilisateur le fournit à la main, pour recalibrer temps de kill et temps par quête. Un humain valide la différence avant de l'appliquer.

### 6.9 Données périmées en jeu

- **Chaque fichier de routes porte :** le build du client, la version de QuestieDB et la date de génération.
- **Si `GetBuildInfo()` diffère du build de la route :**
  - un bandeau visible signale « Routes générées pour le build X » ;
  - la route reste utilisable : on avertit sans bloquer (**décidé par l'utilisateur**). Les builds arrivent tous les 4-5 jours, et bloquer rendrait l'add-on souvent inutilisable ;
  - même règle si la version de QuestieDB installée diffère de celle utilisée pour générer les routes : bandeau d'information, sans blocage.
- **Si QuestieDB est absent ou d'un format incompatible :** message clair, et seuls les onglets qui n'en dépendent pas restent actifs.

## 7. Le générateur de routes (hors jeu)

### 7.1 Données d'entrée, toutes datées et sourcées

| Donnée | Source | Format |
|---|---|---|
| Quêtes, PNJ, objets, points d'apparition, chaînes, niveaux | QuestieDB, saveur Forever (dernière version publiée) | Lua. Mode « baked » : les données sont dans les métadonnées du TOC (environ 19 Mo). À charger avec une VM Lua dans Node (par ex. wasmoon) et des fonctions WoW simulées, ou avec l'outil `generate.lua` de QuestieDB |
| XP de base des quêtes | `QuestieDB/support/Forever/QuestXP/xpDB-traces.lua`, prioritaire sur `xpDB-classic.lua` | `[questId] = {questLevel, xp}` |
| Taux de drop | `QuestieDB/support/Forever/DropTables/` | `[itemId] = {[npcId] = %}` |
| Taille des cartes en yards | wago.tools `UiMapAssignment`, `wowf`, build figé | CSV `https://wago.tools/db2/<Table>/csv?build=1.60.1.71139` |
| Relais et trajets de griffon | wago.tools `TaxiNodes`, `TaxiPath`, `TaxiPathNode` | CSV |
| Temps de vol, bateaux, zeppelins, tram | Shortest Path Forever (cjber, GPL-3.0) : `Data/Taxi.lua`, `Routes.lua`, `Transports.lua` | Lua |
| Stats des mobs (estimation de départ) | cmangos classic-db (GPL-3.0) | SQL |
| Temps fixes d'escorte et de scènes | à mesurer. Les 62 `.timer` de RXP ne servent qu'à vérifier, car leur licence est CC BY-NC-SA | — |
| Constantes de jeu | `model/constants.ts` : chaque valeur avec sa source, sa date et son expiration | TS |

Constantes déjà sourcées (voir les notes) :
- **XP par niveau :** total 4 084 700 de 1 à 60.
- **Vitesses :** course 7 yd/s, monture 11,2, monture épique 14, vol environ 30.
- **Pierre de foyer :** 60 min de recharge, 10 s d'incantation, vérifié dans les données Forever.
- **Monture :** au niveau 40, 90 po selon une source, 100 po selon une autre. À vérifier.
- **Décote de l'XP de quête sur Forever :** `mult = 2*(qLevel-charLevel)+20`, borné à `[5,10]`, avec l'arrondi par paliers de Questie (`getAdjustedXP`).
- **XP des mobs :** formule de vmangos `Formulas.h`.

Le plancher de 50 % pour les quêtes grises et la formule d'XP des mobs sont **à vérifier en jeu**, car une seule source les donne.

**Coordonnées :** les points de QuestieDB sont en pourcentage par zone. La conversion `eraToForever` (Mulgore, Maleterres de l'Est, Les Carmines, Hurlevent) n'est **jamais** appliquée deux fois : on garde l'origine de chaque point.

### 7.2 Modèle de coût et de récompense

Le temps d'une étape se calcule ainsi :
- trajet en tenant compte de la monture selon le niveau, des griffons et de la pierre de foyer ;
- plus 5 à 10 s par interaction avec un PNJ ;
- pour un objectif « tuer » : nombre de kills × (temps pour tuer + ramassage), plus l'attente de réapparition s'il y a moins de mobs vivants que de kills demandés ;
- pour un objectif « récupérer » : on prend le **80ᵉ centile** de la loi géométrique sur le taux de drop, multiplié par le temps pour tuer un mob ;
- pour un objet à ramasser : nombre d'objets × (clic + marche) ;
- plus les temps fixes d'escorte ;
- moins les kills partagés avec d'autres quêtes en cours.

Le **temps pour tuer un mob** vient d'abord des points de vie cmangos divisés par un DPS de référence par niveau. On le recale ensuite avec la télémétrie (§6.8) et avec le chiffre global d'environ 300 s de jeu actif par quête rendue, mesuré dans le journal Questie de l'utilisateur.

### 7.3 Optimiseur

- **Objectif :** atteindre le **quota** de 4 084 700 XP en un **minimum de temps simulé** pour aller du niveau 1 au niveau 60. Ce n'est pas un ratio à maximiser.
- **Contraintes :**
  - ordre prise → objectifs → rendu ;
  - chaînes de quêtes ;
  - niveau minimum vérifié sur l'XP cumulée ;
  - 20 quêtes maximum dans le journal ;
  - quêtes exclusives entre elles ;
  - faction.
- **Grind de comblement :** une quête n'entre dans la route que si son XP par minute marginale bat le grind au même niveau. Sinon, le simulateur insère du grind.
- **Simulateur :**
  - déterministe et **incrémental** : il rejoue à partir de la première étape modifiée ;
  - c'est à la fois la fonction objectif et l'outil d'évaluation.
- **Phase 1 :**
  - un beam search choisit l'ordre des blocs « zone × tranche de niveau » ;
  - dans chaque bloc, une insertion gloutonne qui respecte les précédences, avec l'XP figée au niveau d'entrée dans le bloc.
- **Phase 2 :** une ALNS avec acceptation par recuit simulé et graines fixes. Opérateurs :
  - destruction : aléatoire, liée à une zone ou une tranche, chaîne entière, pires ratios XP/min, segment de temps ;
  - réparation : insertion au moindre coût, ou par regret-k.
- **Phase 3, seulement si l'ALNS plafonne :** LKH-3 (compilé en CI, jamais redistribué) ou OR-Tools (sous-processus Python) sur des segments à XP figée. Un échec du solveur fait échouer la CI : **aucun repli silencieux**.
- **Groupes de mobs :** regroupement géographique des points d'apparition de chaque objectif. On garde le groupe qui minimise le temps de l'objectif, compte tenu de la densité et de la distance à la route, puis on calcule la boucle de visite.

### 7.4 Format d'une étape (sortie)

```ts
type StepType = "accept" | "complete" | "turnin" | "travel" | "fly" | "hearth" | "setHearth" | "getFlightPath" | "grind" | "train";
interface RouteStep {
  type: StepType;
  questId?: number;            // TS optional; no explicit undefined
  objectiveIndex?: number;
  npcId?: number;
  uiMapId: number;
  x: number; y: number;        // zone percent, Forever frame
  loop?: Array<[number, number]>; // spawn loop for kill/collect
  taxiNodeId?: number;
  targetLevel: number; targetXpIntoLevel: number;
  estCostSeconds: number; estXpGain: number;
  unlocks?: number[];          // follow-up quest ids (skip warning)
  races?: number;              // race bitmask, absent = all races of the faction
}
```

**Ce qu'est une route (du niveau 1 au niveau 60) [structure : choix Claude] :**
- **Segments de départ, un par zone de départ :** Elwynn, Dun Morogh, Teldrassil, Durotar, Mulgore, Tirisfal, plus Zephras Isle par faction pour les Skyborne, et les îles des Trolls si elles servent de départ. Chaque segment va du niveau 1 au point où les zones de départ convergent, vers les niveaux 10-20 selon l'optimiseur.
- **Un tronc commun par faction** qui prend la suite jusqu'au niveau 60. Il est optimisé une seule fois pour toute la faction, ce qui garde le calcul et la taille des données raisonnables.
- **Quêtes de classe** (dont les montures de classe) : exclues de l'optimisation en v1.
- **Quêtes de race :**
  - quand la route sert à plusieurs races (par exemple Nains et Gnomes à Dun Morogh), elles sont incluses avec leur masque `races` ;
  - en jeu, une étape non éligible pour la race du personnage est ignorée ;
  - le simulateur évalue la route pour chaque race servie et garde le pire cas pour les contrôles de qualité.

L'export se fait en tables Lua compactes dans les add-ons `MinMaxQuest_Routes_*`, avec les noms de champs raccourcis pour réduire la taille. Un en-tête de version donne le build, la version de QuestieDB, la date et les constantes utilisées.

### 7.5 Variantes : élites et donjons (décidé par l'utilisateur : en option)

- **16 variantes du tronc par faction :** élites (oui/non) × donjons (oui/non) × niveau de quête maximum (désactivé, ou X = 1, 2, 3).
  - Dans les variantes avec X, le simulateur n'autorise une quête que si son niveau est au plus `niveau du joueur − X`.
  - Le générateur produit toutes les variantes, en parallèle en CI.
  - L'add-on ne décode que la variante choisie. Les autres restent stockées sous forme de chaînes compactes, ce qui évite de créer des tables Lua inutiles en mémoire **[choix Claude]**.
- **Élites en extérieur :**
  - temps de kill = temps solo × un facteur de difficulté, constante datée à calibrer **[choix Claude]** ;
  - dans les variantes « + élites », le simulateur suppose que le joueur les fait en groupe de 2 à 3 personnes : XP de kill partagée, temps de kill réduit.
- **Donjons :**
  - **Un bloc par donjon.** On prend **toutes** les quêtes disponibles pour ce donjon (donneurs dans le monde, quêtes de groupe) avant d'y entrer, puis on fait le donjon, puis on rend les quêtes.
  - **Le coût d'une sortie de donjon :** certaines quêtes obligent à sortir pour rendre ou prendre une suite, puis à revenir. Chaque visite du donjon est alors une étape distincte (`enterDungeon`), et l'optimiseur décide si la suite vaut ce coût ou s'il la reporte à une visite suivante.
  - **Les contraintes du jeu :** limite de 5 entrées par heure, temps de recherche de groupe (constante datée), et durée estimée de chaque donjon (table datée, à sourcer ou mesurer).
  - **Point ouvert « à voir » (utilisateur) :** quelles quêtes de donjon imposent une sortie. Il faut les identifier par donjon au moment de construire la table des donjons, avec validation humaine. En attendant, une quête dont l'objectif ou le rendu est hors de l'instance est modélisée comme une visite de plus.
- **Contrôles de qualité** (§7.6) : appliqués à chaque variante séparément. Le seuil de régression est comparé uniquement entre deux versions de la même variante.

### 7.6 Qualité et tests

- **Tests unitaires** des formules sur des valeurs connues :
  - XP de quête avec la décote Forever ;
  - XP des mobs : 95 / 195 / 340 XP à niveau égal aux niveaux 10, 30 et 59 ;
  - conversion des coordonnées ;
  - temps de vol.
- **Contrôles de chaque route générée :**
  - aucune précédence ni niveau minimum violé ;
  - pas plus de 20 quêtes dans le journal ;
  - temps simulé pour atteindre le 60 et XP/h affichés.
- **La CI échoue si :**
  - le temps simulé régresse au-delà d'un seuil ;
  - une constante a expiré ;
  - une donnée source est absente.
- **Robustesse :** perturbation de ±20 % des temps de kill. On préfère une route qui reste bonne dans ces conditions.
- **Add-on :** la logique pure (suivi de route, ciblage, insertion) est testée en Lua avec busted sur le code compilé.

### 7.7 Décisions pour le Plan 2 (2026-11-27, priment sur §7.1 à §7.5)

Principe (utilisateur) : **pas de modélisation fine des données qu'on n'a pas.** Le suivi tolérant du Plan 3 recale la route après un donjon ou une élite. Une estimation grossière, datée et marquée « non vérifiée », suffit.

- **Les 16 variantes** par faction sont générées dès le Plan 2 : élites oui/non × donjons oui/non × niveau maximum (désactivé, 1, 2, 3).
- **Donjons (utilisateur) : tout ou rien.**
  - Option cochée : chaque donjon dont des quêtes sont disponibles pour la faction est **forcé** dans la route. L'optimiseur choisit seulement où le placer.
  - Un donjon = un bloc : prendre toutes ses quêtes (celles dont `zoneOrSort` est l'AreaID du donjon dans `QuestieDB/support/Forever/Zones/dungeons.lua`), aller à l'entrée, faire le donjon, rendre les quêtes.
  - L'XP des kills en donjon est ignorée (estimation prudente). La durée suit les scénarios ci-dessous.
  - **Retours en donjon (utilisateur) :** une suite qui demande de ressortir puis de revenir forme un **bloc de retour**. Le générateur émet pour chaque donjon ses blocs de retour (étapes, coût, XP) comme des chaînes insérables, au même titre que les chaînes d'Accès (§6.2).
    - **Activés par défaut et inclus dans la route optimisée :** les retours qui font partie d'une chaîne d'accès à un raid ou à un donjon, c'est-à-dire les quêtes listées dans `data/access/`.
    - **Désactivés par défaut :** tous les autres. Une option par donjon dans l'onglet Quête (Plan 3) les active, et le bloc est alors inséré en jeu à la position la moins coûteuse.
    - Le point « à voir » de §7.5 est clos.
- **Élites (utilisateur) : tout ou rien.**
  - Option décochée : une quête est exclue si un de ses mobs à tuer est élite (`rank` du PNJ).
  - Option cochée : ces quêtes sont autorisées, avec un temps de kill plus long selon les scénarios. Pas de modèle de groupe.
- **Temps de kill (utilisateur) : aucune valeur unique.**
  - **Hors du jeu :** chaque route est évaluée sur une **plage de scénarios** : temps par kill d'un mob normal (20, 30 et 50 s), facteur élite (1,5 à 3) et durée de donjon. L'optimiseur garde la route dont le temps moyen jusqu'au 60 est le plus bas. Ce sont des hypothèses de robustesse, pas une estimation du joueur. Elles sont datées et marquées « non vérifiées ».
  - **En jeu (Plan 3) :** le temps de kill est mesuré pour le joueur. Première piste : PV du mob lus en jeu (`UnitHealthMax`) divisés par le DPS mesuré du joueur, plus un temps de recherche des mobs mesuré par zone (zones surpeuplées). La disponibilité des événements de combat sous les restrictions de Midnight est **à vérifier**. Ces mesures servent à l'affichage et aux décisions locales (grind ou quête).
  - **PV des mobs : pas de cmangos.** Les PV de QuestieDB sont abandonnés (valeurs 0 ou 1), et les PV lus en jeu sont plus fiables. cmangos ne sert qu'aux quantités d'objectifs (ci-dessous).
- **Quantités d'objectifs (utilisateur) :**
  - d'abord le texte d'objectif de QuestieDB (`objectivesText`, à jour pour Forever) : « Kill 10 Kobold Vermin », nombres écrits en lettres, et un nom seul au singulier sans nombre compte pour 1 ;
  - sinon `quest_template` de cmangos classic-db (`ReqCreatureOrGOCount`, `ReqItemCount`) à un commit épinglé, lu à la génération seulement, jamais redistribué ;
  - sinon la quête est exclue (`noCount`). Le rapport donne la couverture et les désaccords entre les deux sources.
- **Taux de drop inconnus (utilisateur) :** un objet sans taux de drop connu (objets propres à Forever) prend le taux du scénario `questDropChance` (rapide 0,6, moyen 0,4, lent 0,25). Hypothèse de robustesse datée et « non vérifiée ». Un taux nul reste exclu.
- **Choix du candidat [choix Claude] :**
  - chaque scénario construit un candidat, simulé ensuite sous les trois scénarios ;
  - un candidat est écarté s'il viole une règle stricte sous un autre scénario, ou s'il finit sous le niveau cible sous un scénario. La génération ne s'arrête que si aucun candidat n'est valide ;
  - chaque route se termine par un grind jusqu'au niveau cible, à sa dernière position : sans effet quand le niveau est atteint, il comble l'écart d'un scénario qui tue moins de mobs (drops supposés) ;
  - le contrôle par race note si la route atteint le niveau cible ; l'étalon RXP ne compare que nos routes qui atteignent le niveau comparé.
- **Coût du grind [choix Claude] :** le constructeur estime le grind avec le coût par kill du simulateur (kill, loot, marche à l'espacement moyen du groupe de mobs).
- **Donjons de groupe [choix Claude] :** le type d'instance vient des tables wago.tools `Map` et `AreaTable` du build `wowf`. Seuls les donjons de groupe sont gardés. Les quêtes de raid et de champ de bataille sont exclues.
- **Tailles de cartes [choix Claude] :** `Data/Zones.lua` de Shortest Path Forever, de la même version que les fichiers déjà vendus. Ses rectangles viennent de `UiMapAssignment` du build `wowf`. Zephras (absente de ce fichier) prend son rectangle dans `UiMapAssignment` de wago.tools, vendu dans `vendor/wago/`. Ils servent à convertir les pourcentages de zone en yards hors du jeu. Contrôle hors du jeu à chaque génération : les maîtres de vol de QuestieDB, une fois convertis, doivent tomber sur les relais de griffon de Shortest Path Forever (écart médian). Sinon la génération s'arrête.
  - Par relais : un relais sans maître de vol à moins de 100 yards n'est pas apprenable. La route ne l'apprend ni ne l'utilise, et le rapport le liste.
- **Lecture de QuestieDB [choix Claude] :** clone du tag QuestieDB épinglé et daté, chargé dans wasmoon avec l'émulateur hors jeu de QuestieDB (`emulator/client.lua`, `emulator/metadata.lua`). Les corrections de QuestieDB sont donc appliquées comme en jeu. Le résultat est un instantané JSON en cache, non commité.
- **Réutilisation [choix Claude] :** le générateur importe directement le code TS pur de l'add-on : graphe de trajet, `questXp`, `XP_PER_LEVEL`, disponibilité et constantes datées. Le trajet est donc calculé hors jeu exactement comme en jeu.
- **Pierre de foyer (utilisateur) :** le simulateur suit l'auberge liée et le temps de recharge (`hearthCooldownSec`, déjà sourcé). L'optimiseur choisit où lier la pierre (étape `setHearth` chez un aubergiste) et quand l'utiliser (étape `hearth`). En jeu, si la pierre est en recharge, le graphe de trajet passe par la marche ou le griffon.
- **Simplifications v1 [choix Claude]** (reprises par l'ALNS au Plan 3) :
  - un point de vol est appris à la première étape de la route dans sa zone, via une étape `getFlightPath` ;
  - pas de repos, et la monture à 40 ne coûte pas d'or ;
  - le tronc commun part du niveau 10, depuis la capitale de la faction. Chaque segment de départ va du niveau 1 au niveau 10, ou jusqu'à épuisement des quêtes de la zone de départ, puis comble par du grind.
- **Périmètre :**
  - le Plan 2 tourne en local (`npm run gen:routes`) sur le QuestieDB installé, et écrit les routes et un rapport (temps simulé jusqu'au 60, XP/h par variante) ;
  - une génération partielle (`--faction`, `--variant`) écrit dans `tools/route-builder/.cache/partial/`, jamais dans `data/routes/` ;
  - les tests utilisent de petites données de test, pour que la CI n'ait pas besoin de QuestieDB ;
  - les routes ne sont pas encore chargées en jeu : le suivi de route, les add-ons de données chargés à la demande et la régénération en CI sont au Plan 3.
- **Étalon :** les guides RXP Forever 1-22 installés en local, passés dans le simulateur pour comparer, jamais redistribués.

## 8. Mises à jour

- **GitHub Actions, chaque jour, et aussi à chaque nouvelle version de QuestieDB :**
  1. Récupérer la dernière QuestieDB, les CSV wago.tools du build courant de `wowf` et Shortest Path Forever.
  2. Générer les routes.
  3. Passer les contrôles du §7.6.
  4. **Publier automatiquement** (décidé par l'utilisateur) **seulement si** les contrôles passent **et** que la route gagne plus qu'un seuil de temps simulé, ou que les données d'entrée ont changé. Cela évite de modifier la route du joueur sans raison. Chaque version publiée contient un journal lisible : diff de route, temps simulé avant et après, sources et versions.
- **Expiration des constantes :**
  - **par date** : 30 jours par défaut, valeur propre à chaque constante **[choix Claude]**. Une constante expirée fait échouer la CI jusqu'à sa revalidation par un humain ;
  - **par build** : à chaque nouveau build `wowf`, la CI compare les tables wago.tools utilisées (`UiMapAssignment`, `Taxi*`) avec celles du build précédent. Si elles sont identiques, on continue avec le nouveau tampon de build. Si elles diffèrent, on arrête et un humain valide le diff.
- **Distribution (décidé par l'utilisateur) :** sources sur GitHub (GPL-3.0), add-on publié sur **CurseForge et Wago**. L'utilisateur crée lui-même les projets et les jetons d'API, puis les enregistre comme secrets GitHub. Le dossier n'est pas encore un dépôt git.

## 9. Ce qui est laissé au développeur

- Choisir la VM Lua utilisée dans Node pour lire QuestieDB.
- Les seuils exacts (N étapes, distance de 25 m, seuil de publication, DPS de référence), à ajuster avec les mesures.
- La structure interne des modules TS, en respectant §5.
- Les déclarations de types de l'API WoW pour TSTL : partir de `@wartoshika/wow-declarations` et compléter les API propres à Forever.

## 10. Ordre de construction proposé

1. Squelette de l'add-on en TSTL : fenêtre à 3 onglets, style, flèche déplaçable, lecture de QuestieDB.
2. Onglet Complétion avec ses deux réglages, puis le vol automatique.
3. Onglet Accès avec le JSON maintenu à la main.
4. Générateur, phase 1 : lecture des données, constantes datées, simulateur, beam search, export. Puis le suivi de route de l'onglet Quête.
5. Télémétrie et calibrage.
6. ALNS (phase 2), puis pipeline CI de publication quotidienne.
