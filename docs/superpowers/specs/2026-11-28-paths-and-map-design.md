# Trajets réalistes et carte lisible — Conception courte

Date : 2026-11-28. Demandes de l'utilisateur après des essais en jeu : la flèche envoyait à pied vers le mont Hyjal depuis le Repaire des Grumegueules, alors qu'il fallait reprendre le vol ; les marqueurs de carte sont peu visibles ; la zone de farm doit être dessinée.

> **[choix Claude]** = ma proposition, pas encore validée explicitement. Le reste vient de l'utilisateur.

## 1. Trajets

### Pourquoi
La règle de l'utilisateur est la suivante : prendre le vol si (marche jusqu'au point de vol de départ + vol + marche depuis le point d'arrivée) < marche directe. Le graphe de trajets (Dijkstra) applique déjà cette règle. L'erreur vient de la **marche** : elle est estimée en ligne droite × 1,25 entre deux points d'un même continent. Cette estimation ignore les montagnes et les passages, donc la marche directe paraît trop courte.

### Approches (analyse de Shortest Path Forever, `spf-analysis.md`)
- **B. Reprendre les temps de marche précalculés de SPF (retenue, en premier).** `Data/Walks.lua` donne le coût de marche entre chaque paire de lieux fixes : points de vol, quais, portails. Ces coûts sont calculés sur un maillage de navigation tiré du client Forever. On reprend aussi `Data/Portals.lua`, qui contient 7 portails, dont les passages du tram des Profondeurs.
- **A. Appeler SPF en jeu quand il est installé (retenue, ensuite).** Son API `Estimate` donne le temps d'un trajet. Elle sert à affiner le début et la fin du trajet, avec un repli sans SPF.
- **C. Embarquer son maillage (écartée).** Il pèse 28,8 Mo et seul le client Forever sait le décoder.

### B en détail
- **Données :**
  - on garde une copie de `Data/Walks.lua` et `Data/Portals.lua` à la version déjà épinglée (commit `3f7008e…`), avec leur licence GPL-3.0 ;
  - on les crédite dans NOTICE ;
  - une note signale que les poids de route viennent de Polestar (Fitz), « utilisés avec permission ». L'utilisateur prévient l'auteur avant une publication large.
- **Entre deux lieux fixes :** l'arête de marche prend le coût précalculé de SPF quand la paire existe.
- **Paire absente :** les deux lieux ne sont pas reliés à pied, et l'arête devient infinie. **[choix Claude :** c'est le sens de SPF : une paire n'est précalculée que sur un même bloc de terre reliée. **]**
- **Départ et arrivée** (joueur, cible), quand l'appel en jeu de l'étape A n'est pas disponible : l'estimation de marche directe entre deux points devient plus prudente **[choix Claude]**.
  - Avec L1 le lieu fixe le plus proche du départ et L2 celui de l'arrivée, la marche directe ne vaut **jamais moins** que walk(L1, L2) − dist(départ, L1) − dist(arrivée, L2). C'est une borne basse, de type ALT.
  - Si walk(L1, L2) n'existe pas, les deux points ne sont pas reliés à pied et la marche directe est interdite.
  - C'est ce qui corrige le cas Hyjal : depuis les tunnels, le lieu fixe le plus proche n'est pas relié à pied à celui du mont Hyjal.
- **Portails :** les 7 portails de SPF remplacent ou complètent les 2 portails importés de cmangos. Le portail Skyborne (Dalaran) vers Hurlevent est ajouté à la main par SPF, et on le garde.
- **Données datées :** le nouveau source est daté comme les autres, avec une expiration qui bloque bruyamment.
- **Routes :** elles sont régénérées.

### A en détail (tâche suivante)
- **Détection :** `ShortestPathForever.API`, version 1 ou 2, est présente.
- **Utilisation :** pour le trajet joueur → cible en cours seulement, on appelle `Estimate`. Le résultat est mis en cache, avec un nombre limité d'appels par rafraîchissement.
- **Décision :** si le temps donné par SPF est supérieur à notre estimation de marche directe, on garde le plus long des deux. Le choix entre vol et marche suit alors.
- **Repli :** SPF absent, en combat ou en chargement, on garde l'estimation de B.

## 2. Carte (maquette validée, couleur « or des quêtes »)
- **Couleur :** l'or des quêtes du jeu, `#FFD100`, à la place du doré de la fenêtre, pour les épingles comme pour les zones. **[valeur à confirmer dans le client]**
- **Épingles :**
  - épingle dorée numérotée : 1 pour l'étape en cours, 2 pour la suivante ;
  - contour sombre et ombre portée ;
  - l'étape en cours est un peu plus grande et porte un halo qui pulse.
  - Les textures sont des TGA générées par un script hors du jeu, comme la flèche. Le numéro est un texte posé sur l'épingle. Le pulse est une animation du jeu (`AnimationGroup`).
- **Zone de farm** (objectifs tuer ou ramasser) :
  - une forme qui épouse les points d'apparition, pas un cercle : contour en tirets le long de l'enveloppe des points, légèrement élargie ;
  - un halo doux sur chaque point d'apparition ;
  - une étiquette « Nom x/y ».
  - Sur la carte du monde : des lignes (`CreateLine`) et des textures posées sur le canevas de la carte. Sur la minicarte : des halos doux aux points d'apparition. **[choix Claude :** le contour n'est tracé que sur la carte du monde. **]**
- Les épingles et la zone suivent l'épinglage et le point de passage actuels, comme aujourd'hui.

## 3. Hors de ce lot
- La carte de navigation complète de SPF (option C).
- Le détour d'un vrai chemin dessiné sur la carte.
