# Fenêtre au style BetterBags — Conception courte

Date : 2026-11-28. Demande de l'utilisateur : « j'aime beaucoup le style de BetterBags, on peut faire un style similaire ? ». Il a choisi l'apparence **et** la mise en page (« Look + layout »), avec des **lignes de texte et de petites icônes** plutôt qu'une grille d'icônes. Il a validé les maquettes Complétion et Accès (« Yes, go »).

> **[choix Claude]** = ma proposition, pas encore validée explicitement. Le reste vient de l'utilisateur ou des maquettes validées.

## 1. Pourquoi
La fenêtre actuelle (fond presque noir, Arial Narrow, titres en petites capitales) est fonctionnelle mais terne. BetterBags montre des sections nettes, chacune avec son compteur et une fine ligne, sur un fond violet sombre : on lit d'un coup d'œil ce qui reste à faire.

## 2. Approches envisagées
- **A. Lignes + petites icônes (retenue par l'utilisateur).** Les quêtes restent des lignes (nom et temps de trajet visibles d'un coup d'œil), rangées en sections façon BetterBags. Chaque ligne commence par une petite case dorée qui indique son type.
- **B. Grille d'icônes.** Écartée : il faut survoler chaque case pour lire le nom et le temps, ce qui est peu pratique pendant qu'on suit un guide.

## 3. Apparence (maquettes validées)
- **Palette** dans `ui/theme.ts` :

  | Élément | Valeur |
  |---|---|
  | fond | `#1b1830`, alpha 0.93 |
  | lignes et bordure | `#3a3360` |
  | titre et titres de section | `#f1e7c8` |
  | texte secondaire, compteurs, temps | `#9d95c4` |
  | lignes faites | `#8f8aa8` |

  L'accent doré `#c9a75a` est gardé (soulignement des onglets, bordure des cases, barres de progression). Le texte des lignes reste clair (`#dddddd`).
- **Polices :**
  - titre de la fenêtre (« MinMaxQuest », casse normale) et titres de section : Friz Quadrata, `Fonts\FRIZQT__.TTF`, la police du jeu ;
  - lignes, onglets et compteurs : Arial Narrow comme aujourd'hui, pour rester dense ;
  - titre de la fenêtre en 16 et titres de section en 13. **[choix Claude]**
- **En-tête :** titre à gauche ; œil et engrenage à droite, comme aujourd'hui. Il n'y a pas de bouton de fermeture : l'œil fait déjà ce travail. **[choix Claude]**
- **Onglets :** la rangée principale et les sous-onglets de Complétion gardent leur fonctionnement. L'onglet actif a le texte `#f1e7c8` et un soulignement doré, les autres le texte `#9d95c4`.
- **Titre de section** (nouvel élément commun `section(parent, …)` dans `theme.ts`) :
  - le nom en Friz Quadrata ;
  - le compteur en petit, couleur secondaire ;
  - une fine ligne `#3a3360` qui court jusqu'au bord droit ;
  - un clic replie ou déplie la section, là où elle est déjà repliable aujourd'hui.
- **Case de type** (nouvel élément commun) : un carré de 16 px avec une bordure dorée de 1 px, un fond `#2a2446` et une petite icône du jeu.
  - Toutes les icônes doivent exister dans le client 1.60.1 et sont vérifiées en jeu.
  - Icônes **[choix Claude]** :

    | Type | Icône |
    |---|---|
    | à prendre | `Interface\GossipFrame\AvailableQuestIcon` (« ! ») |
    | à rendre | `Interface\GossipFrame\ActiveQuestIcon` (« ? ») |
    | tuer | `Interface\CURSOR\Attack` |
    | ramasser ou utiliser | `Interface\CURSOR\Pickup` |
    | vol | `Interface\CURSOR\Taxi` |
    | pierre de foyer | `Interface\Icons\INV_Misc_Rune_01` |
    | fait | la coche de `GLYPH.check` |

## 4. Mise en page par onglet
- **Taille unique :** toutes les fenêtres font **320 × 480**, comme une vraie fenêtre de sac. La taille ne change plus selon l'onglet, et chaque onglet répartit son contenu dans cette surface. (Proposé dans le message des maquettes, accepté avec « Yes, go ».)
- **Complétion** (maquette) :
  - les cibles sont rangées en trois sections, dans cet ordre : **À rendre**, **Objectifs**, **À prendre** ;
  - chaque section affiche son nombre de lignes, et les lignes y restent triées par temps de trajet ;
  - une section vide est masquée ;
  - la cible de la flèche ne change pas : c'est toujours la plus proche, toutes sections confondues ;
  - sa ligne est mise en évidence (texte `#f1e7c8` et « » ») **[choix Claude]**, puisqu'elle n'est plus forcément la première de la liste ;
  - les sous-onglets, le sélecteur de zone (en Zone seulement), les filtres Grises / Élites et les compteurs restent, avec le nouveau style.
- **Accès** (maquette) :
  - les groupes Donjons, Raids, Clés et Divers deviennent des sections avec « faits / total » ;
  - chaque entrée a sa case : coche si l'entrée est finie, « ▸ » si elle est en cours, case vide sinon ;
  - à droite de chaque entrée, sa tranche de niveaux, ou une petite barre de progression si l'entrée est commencée ;
  - les étapes dépliées restent en retrait, avec leurs états (faites grisées, en cours « » ») ;
  - le défilement et le suivi dans la route ne changent pas.
- **Quête** **[choix Claude, pas de maquette]** :
  - mêmes éléments : une section « Étape actuelle » avec la case du type d'étape, puis une section « Ensuite » avec les étapes suivantes ;
  - les parties repliables Options et Donjons deviennent des sections repliables ;
  - le bandeau hors route et le bouton Re-sync gardent leur rôle.
- **Fenêtres annexes :** le sélecteur de zone, la boîte « Passer » et le bandeau de données prennent la palette, et c'est tout. **[choix Claude]**
- **Hors de ce lot :** la flèche et le bouton d'objet, une grille d'icônes, une section « Objets de quête ».

## 5. Contraintes
- Mêmes règles que le reste de l'addon :
  - frames créées une seule fois, jamais en combat ;
  - pas d'allocation par frame ;
  - `guard` / `reportOnce` ;
  - textes via l10n enUS et frFR.
- Le contenu doit tenir dans 320 × 480 en enUS comme en frFR. Les tests de mise en page existants (en-tête de Complétion, rangées) s'étendent à la nouvelle taille.
- Les polices et les icônes ne s'affichent qu'en jeu : la liste de vérification en jeu reçoit une ligne par élément visuel.
- Le README (Features) décrit la nouvelle apparence, sans toucher à « Latest update ».

## 6. Ce qui est laissé au constructeur
- Les marges et espacements exacts.
- La hauteur des lignes, entre 15 et 18 px.
- La façon de répartir le contenu de l'onglet Quête dans 320 × 480.
