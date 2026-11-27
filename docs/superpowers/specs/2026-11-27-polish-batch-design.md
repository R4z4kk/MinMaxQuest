# Lot de finitions après le premier essai en jeu — Conception courte

Date : 2026-11-27. Complète la spec principale et la conception du suivi de route. Demandes de l'utilisateur après le premier essai en jeu de la PR #5.

> **[choix Claude]** = ma proposition, pas encore validée explicitement. Le reste vient de l'utilisateur, qui a choisi les options recommandées.

## 1. Flèche déplaçable à la souris (utilisateur)
- Tant qu'elle n'est pas verrouillée, la flèche se déplace directement à la souris (clic gauche maintenu), sans commande.
- La position est sauvegardée à la fin du déplacement.
- Une case **« Verrouiller la flèche »** dans les Options de l'onglet Quête la fige. Verrouillée, elle ne capte plus la souris.
- Les commandes `/mmq arrow move` et `/mmq arrow lock` restent et pilotent la même case.
- Un personnage sans réglage sauvegardé démarre déverrouillé, pour qu'on puisse placer la flèche. Les réglages existants sont gardés. **[choix Claude]**

## 2. Texte sous la flèche en blanc (utilisateur)
- Le libellé de l'étape, sous la distance, passe du gris (`#8b8b8b`) au même blanc que la distance (`#e6e6e6`).

## 3. Flèche vers le cadavre (utilisateur)
- Mort ou fantôme (`UnitIsDeadOrGhost("player")`), la flèche vise le cadavre, avec le libellé « Ton corps » / « Your corpse » et la distance.
- Cette cible passe avant tout le reste : route, Complétion, épinglage.
- **Position [choix Claude] :** `C_DeathInfo.GetCorpseMapPosition` sur la carte où se trouve le joueur (`C_Map.GetBestMapForUnit`), puis sur sa carte parente si besoin. C'est la méthode de RXPGuides (`map.lua`). Si aucune position n'est connue, par exemple quand le cadavre est dans une instance, la flèche est masquée et un message s'affiche une fois.
- Une fois le personnage ressuscité, la cible normale revient.

## 4. Langue au choix (utilisateur)
- Réglage **Langue : Auto / English / Français** dans les Options de l'onglet Quête. **Auto** suit la langue du client, comme aujourd'hui.
- Le réglage est sauvegardé pour tout le compte. **[choix Claude]**
- Il couvre tous les textes de MinMaxQuest. Les noms de quêtes, de PNJ et de zones viennent du client WoW et restent dans sa langue. Le README le précise.
- Le changement s'applique après un rechargement de l'interface. Un bouton « Recharger » (`ReloadUI`) s'affiche à côté du réglage quand il diffère de la langue en cours. **[choix Claude :** ça évite de redessiner à chaud toutes les fenêtres. **]**

## 5. Bouton d'objet de quête (utilisateur : « comme RestedXP »)
- Quand l'étape visée par la flèche concerne une quête qui demande d'**utiliser un objet**, un petit bouton carré avec l'icône de l'objet apparaît à côté de la flèche. Un clic utilise l'objet.
- **Objets concernés [choix Claude] :**
  - l'objet fourni par le donneur de quête (`sourceItemId` de QuestieDB) et les objets requis (`requiredSourceItems`) ;
  - seulement s'ils sont dans les sacs (`C_Item.GetItemCount`) et utilisables (`C_Item.GetItemSpell`, qui renvoie un sort).

  Ce sont des données, pas un guide écrit à la main.
- **Affichage :**
  - icône (`C_Item.GetItemIconByID`), nombre, recharge (spirale) et infobulle de l'objet au survol ;
  - **le bouton est déplaçable lui aussi (utilisateur) :**
    - sa première position est à droite de la flèche ;
    - tant que la case « Verrouiller la flèche » est décochée, on le déplace par une fine poignée (cadre non sécurisé qui l'entoure), hors combat seulement : un cadre qui contient un bouton sécurisé ne peut pas bouger en combat ;
    - sa position est sauvegardée par personnage, à part de celle de la flèche ;
    - la même case verrouille la flèche et le bouton. **[choix Claude]**
- **Sécurité (contraintes de l'API WoW) :**
  - bouton `SecureActionButtonTemplate` (`type = "item"`, `item = "item:ID"`), créé une seule fois hors combat ;
  - ses attributs et son affichage ne changent que hors combat ; un changement demandé en combat est appliqué à `PLAYER_REGEN_ENABLED`.
- Si plusieurs objets conviennent, le premier dans l'ordre (objet fourni, puis objets requis) est affiché. **[choix Claude]**
- Fonctionne dans les deux modes, Quête et Complétion.

## 6. Mode « Journal » dans Complétion (utilisateur : 3e mode)
- Le sélecteur de Complétion devient **Proximité / Zone / Journal**.
- En mode Journal :
  - seules les quêtes déjà dans le journal sont ciblées ; les objectifs non remplis et les rendus sont triés par temps de trajet réel ;
  - aucune quête nouvelle n'est proposée ;
  - les filtres Grises et Élites ne s'appliquent pas, puisque le but est de vider le journal ; **[choix Claude]**
  - le sélecteur de zone est masqué ;
  - l'en-tête affiche « N quêtes dans le journal ».
- Le mode est sauvegardé comme les deux autres (`db.completion.mode`).

## 7. Hors de ce lot
- Télémétrie et temps de kill (Plan 3b), ALNS (Plan 3c), régénération en CI (Plan 3d).

## 8. Tests et documentation
- **Tests :**
  - logique pure en vitest : choix de l'objet, mode Journal, priorité du cadavre ;
  - code compilé en Lua avec le faux jeu : déplacement et verrouillage de la flèche, bouton sécurisé créé hors combat et mis à jour après le combat, réglage de langue ;
  - ajouter au faux jeu les stubs manquants (`C_DeathInfo`, `C_Item.*`, `ReloadUI`, `SecureActionButtonTemplate`).
- **README :** mise à jour de Features (flèche, Complétion, langue, bouton d'objet, cadavre) selon la règle du projet.
- **Liste de vérification en jeu :** une ligne par point.
