# Métiers et hôtel des ventes — Conception courte

Date : 2026-11-28. Demande de l'utilisateur après « Le philtre d'amour » (4201). La flèche l'envoyait en Gangrebois chercher 4 Gromsang, une herbe, alors qu'il n'est pas herboriste. Ses mots : « étends cela à tous les métiers… Sur des ressources aussi classiques que des herbes ou des minerais ou bien des crafts faits par les métiers, on évite le farm de monstres pour aller chercher ce butin ». Plan validé : « Je suis assez d'accord avec le plan ».

> **[choix Claude]** = ma proposition, pas encore validée explicitement. Le reste vient de l'utilisateur.

## 1. Règle
Pour un objectif « obtenir l'objet X » d'une quête :
1. **X est une ressource ou un produit de métier** dans l'un de ces cas :
   - X se récolte : herbe, minerai, dépeçage ou pêche ;
   - X se fabrique par un métier : alchimie, forge, enchantement, ingénierie, travail du cuir, couture, cuisine ou secourisme ;
   - X est une étoffe (classe 7 « Artisanat », sous-classe « Étoffe » = 5 dans les données TBC de QuestieDB ; les données classiques mettent étoffes et viandes en sous-classe 0). C'est la seule exception « Artisanat » sans récolte ni fabrication : la règle de l'utilisateur est « herbes, minerais, crafts ». Les viandes et morceaux de monstres (classe 7 sans récolte ni fabrication) restent des butins de monstres.
2. **Dans ce cas, on ne farme pas de monstres pour X.** Les butins de monstres ne comptent plus comme source.
3. **Si tu as le métier de récolte de X** (herboristerie pour une herbe, minage pour un minerai, etc.), les points de récolte restent la cible.
4. **Si X se fabrique et que tu as le métier**, la cible est « Fabrique X ». Il n'y a pas de position : la flèche ne s'affiche pas pour cet objectif, et on passe à la cible suivante. **[choix Claude]**
5. **Sinon**, l'objectif devient **« Achète X ×N à l'hôtel des ventes »**, et la flèche vise le commissaire-priseur le plus proche de ta faction, en temps de trajet.
6. **Un objet qui n'est pas de métier** (objet de quête, butin propre à un monstre) garde le comportement actuel.
7. **Niveau de compétence :** pour ce lot, on vérifie seulement que tu as le métier, pas ton niveau. **[choix Claude]**

## 2. Données (hors du jeu, datées et sourcées)
- Un nouveau générateur produit `addon/src/data/generated/professions.ts`. Il ne couvre que les objets qui apparaissent dans les objectifs de quête de QuestieDB.
- **Pour chaque objet :**
  - ses moyens d'obtention de métier : `gather` (avec le métier de récolte), `craft` (avec le métier de fabrication) ;
  - un indicateur « ressource de métier ».
- **Sources :**
  - **Récolte d'herbe et de minerai :** les objets de jeu (`gameobject_template`, type coffre) de cmangos classic-db, déjà utilisé et épinglé. Leur verrou est relu dans la table wago `Lock`, qui donne le type de verrou herboristerie ou minage.
  - **Dépeçage :** `skinning_loot_template` de cmangos.
  - **Pêche :** `fishing_loot_template` de cmangos.
  - **Fabrication :** les tables wago `SpellEffect` (effet « créer un objet ») et `SkillLineAbility` (sort vers ligne de compétence) pour le build 1.60.1.71139, ce qui couvre Forever.
  - **Classe d'objet :** QuestieDB (classe), et sous-classe « Étoffe » lue dans les données TBC de QuestieDB.
  - **Commissaires-priseurs :** le champ `npcFlags` de QuestieDB (drapeau « commissaire-priseur »), avec leur faction.
  - **Sorts de métier connus du joueur :** pour chaque métier, ses sorts de rang (Apprenti → Artisan), tirés de `SkillLineAbility`, pour la détection en jeu.
- L'expiration est bruyante comme pour les autres sources, et un rapport `data/professions/report.md` donne les comptes.

## 3. En jeu
- **Détection des métiers :** un métier est présent si l'un de ses sorts de rang est connu (`IsPlayerSpell` ou `IsSpellKnown`). Cette méthode ne dépend pas de la langue du client. L'état est relu au changement de compétences (`SKILL_LINES_CHANGED`) et à la connexion.
- **Complétion (tous les modes) et cibles de la route :** la règle du §1 s'applique aux objectifs « objet ».
- **Libellés :** « Achète {item} ×{n} à l'hôtel des ventes » et « Fabrique {item} ×{n} », en enUS et frFR.
- **Insertion dans la route :** le lieu d'un objectif devenu « hôtel des ventes » est le commissaire-priseur le plus proche.

## 4. Tests et documentation
- **Générateur :** Gromsang (8846) est une herbe d'herboristerie, Gros veinard d'argent (11405) n'est pas une ressource de métier, et on vérifie un objet fabriqué et un objet de dépeçage.
- **Règle :** on teste chaque branche du §1.
- **Faux jeu :** sans herboristerie, l'objectif Gromsang vise le commissaire-priseur ; avec, il vise l'herbe.
- **README :** une ligne Features. **Liste de vérification en jeu :** une ligne.
