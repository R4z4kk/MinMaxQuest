# Accès complets et points de passage — Conception courte

Date : 2026-11-27. Complète la spec principale (§6.3 Accès, §6.2 et §6.4 flèche) et la conception du suivi de route. Demandes de l'utilisateur après le deuxième essai en jeu.

> **[choix Claude]** = ma proposition, pas encore validée explicitement. Le reste vient de l'utilisateur.

## 1. Points de passage pour les objectifs « tuer » ou « ramasser » (utilisateur : validé)

- **Problème :** la boucle de la flèche ne tourne que dans un groupe de points d'apparition de 60 yards (`CLUSTER_RADIUS_YARDS`). Quand les mobs sont dispersés, ce groupe se réduit souvent à un seul point : la flèche reste dessus et le point ne « s'efface » pas.
- **Nouvelle boucle** (`waypointLoop`) :
  - part du groupe choisi comme aujourd'hui ;
  - prend tous les points d'apparition des cibles de l'objectif (PNJ, objets, sources d'objet) à moins de **250 yards** du centre de ce groupe, dans la limite de **25 points** **[choix Claude, réglables]** ;
  - les ordonne en partant du plus proche voisin du joueur ;
  - passe au point suivant à 25 yards, comme aujourd'hui, et boucle jusqu'à ce que l'objectif soit rempli.
- **Même code dans les deux modes :** en mode Quête, la boucle est construite dans le jeu avec les positions QuestieDB, comme en Complétion. La petite boucle calculée hors du jeu ne sert plus à la flèche. Les routes ne sont pas régénérées.
- **Carte et minicarte :** le marqueur de l'objectif suit le point de passage en cours. **[choix Claude]**

## 2. Accès : tout ce qui est à débloquer (utilisateur)

### 2.1 Source : les données d'Attune (utilisateur : « on s'inspire fortement, utilise-les »)
- **Données reprises :** celles de l'add-on **Attune** (CixiDelmont, version de son `.toc` : `16001-46`, `AttuneData.lua` et `Locales/enUS.lua`, `frFR.lua`).
- **Licence :** Attune ne déclare aucune licence. L'utilisateur a choisi de reprendre ses données (identifiants de quêtes et d'objets, ordre des étapes, noms traduits). Attune est crédité dans `NOTICE` et dans le README. **[À noter :** demander l'accord de l'auteur reste prudent avant une publication large. **]**
- **Outil d'import :** un outil hors du jeu, `tools/access-import/`, lit les fichiers Attune installés en local, comme le générateur lit QuestieDB. Il produit :
  - `addon/src/data/generated/access.ts` (versionné, daté, avec la source) ;
  - un rapport `data/access/report.md`.

  On le relance à la main quand Attune ou QuestieDB change. Le diff passe en PR : un humain valide, comme le veut la spec §6.3.

### 2.2 Contenu
Tous les groupes d'Attune, filtrés par faction :
- **Donjons :** 54 entrées, avec la liste de leurs quêtes et la tranche de niveau.
- **Raids :** Cœur du Magma, Onyxia (une entrée par faction), Repaire de l'Aile noire, Naxxramas…
- **Clés :** 7 entrées.
- **Divers :** sac de couchage, Quintessence aquatique, Sceptre des Sables changeants…
- Les **Égouts et le Tome de Dalaran** (Forever) restent, fusionnés s'ils existent déjà dans Attune.

Types d'étapes repris :
- quête : prendre, rendre, quête entière ;
- objet à obtenir, mob à tuer, niveau à atteindre ;
- interaction et clic ;
- réputation, métier ;
- fin de la chaîne.

Les « séparateurs » d'Attune ne sont pas repris.

### 2.3 Vérification et compléments (utilisateur : « tu dois vérifier ça »)
L'import croise Attune avec QuestieDB (l'instantané du générateur) et écrit dans le rapport :
- **les identifiants de quêtes ou d'objets d'Attune absents de QuestieDB**, ou d'une faction incompatible ;
- **les donjons à 5 de QuestieDB absents d'Attune**, sélectionnés par le type d'instance de wago.tools comme au Plan 2 ;
- **les quêtes de donjon de QuestieDB absentes des listes d'Attune**, celles dont le `zoneOrSort` est le donjon.

**Compléments automatiques [choix Claude] :**
- les donjons manquants et les quêtes de donjon manquantes sont ajoutés, marqués « QuestieDB » ;
- les identifiants Attune introuvables sont gardés mais signalés dans le rapport, parce qu'ils peuvent venir d'un retard de QuestieDB.

L'import échoue s'il ne trouve pas les fichiers Attune ou si leur format a changé. Il n'y a pas de valeur de repli.

### 2.4 Dans le jeu
- **Onglet Accès :**
  - groupes **Donjons / Raids / Clés / Divers**, repliables ;
  - pour chaque entrée : sa progression et ses étapes (faites barrées, en cours ▸, à venir) ;
  - les noms viennent d'Attune (enUS/frFR) suivant la langue de MinMaxQuest ;
  - les noms de quêtes viennent du client.
- **Progression :**
  - quête rendue ou dans le journal, selon le type d'étape ;
  - objet présent dans les sacs (`C_Item.GetItemCount`) ;
  - niveau atteint ;
  - les étapes sans contrôle possible (interaction, clic, mob tué, réputation, métier) sont faites quand une étape suivante l'est.
- **« Suivre dans la route » :**
  - insère les **quêtes** de l'entrée (prendre, objectifs, rendre) avec l'insertion existante ;
  - les étapes d'objet ou de mob d'une chaîne restent affichées dans l'onglet sans être insérées. **[choix Claude :** leur position n'est pas connue de façon fiable. **]**
- **Fenêtre :** l'onglet garde sa taille. La liste défile si elle dépasse la place disponible. **[choix Claude]**

## 2bis. Demandes du troisième essai en jeu (utilisateur)

1. **La flèche suit la fenêtre :**
   - `/mmq` affiche ou cache ensemble la fenêtre, la flèche et le bouton d'objet ;
   - fenêtre cachée, flèche et bouton sont masqués ;
   - le mode déplacement (« placing ») est une exception : on peut placer la flèche fenêtre ouverte. **[choix Claude]**
2. **Bouton « œil »** à gauche de l'engrenage : un clic cache la fenêtre, la flèche et le bouton d'objet ; `/mmq` les fait revenir. L'état est sauvegardé par personnage. **[choix Claude]**
3. **Contour de la flèche :** le contour pointillé et la poignée n'apparaissent qu'au survol de la souris quand la flèche est déverrouillée, et pendant un déplacement. Ils ne sont plus visibles en permanence. **[choix Claude]**
4. **Proximité = zone actuelle + zones voisines :**
   - en mode Proximité, la liste et les cibles se limitent aux quêtes dont la zone (`zoneAreaId` vers sa carte) est la carte actuelle ou une carte voisine ;
   - **voisine [choix Claude] :** même continent, et rectangle monde (données de HereBeDragons, `mapData` : `left`, `top`, `width`, `height`) qui touche celui de la carte actuelle ou passe à moins de 300 yards ;
   - une quête sans zone connue reste exclue de Proximité, mais apparaît en Zone et en Journal ;
   - le compteur « restantes » suit le même périmètre.
5. **Sous-onglets de Complétion :**
   - sous la barre Quête / Accès / Complétion, une seconde rangée d'onglets du même style : **Proximité | Zone | Journal** ;
   - un clic choisit directement le mode ; il n'y a plus de bouton qui fait défiler les modes ;
   - le sélecteur de zone n'apparaît qu'en mode Zone.

## 3. Hors de ce lot
- Télémétrie (Plan 3b), ALNS (3c), CI (3d).

## 4. Tests et documentation
- **Tests :**
  - `waypointLoop` : rayon, limite de 25 points, ordre, rotation ;
  - l'import sur un petit extrait Attune écrit pour le test : types d'étapes, faction, noms, rapport ;
  - la progression des étapes ;
  - l'onglet Accès en Lua compilé : groupes, défilement, suivi.
- **README :** onglet Accès et points de passage, crédit Attune. **NOTICE :** crédit Attune.
- **Liste de vérification en jeu :** une ligne par point.
