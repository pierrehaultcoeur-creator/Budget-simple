# Upvanta — système d’illustrations (préparation, non branché à l’application)

Statut : **inventaire et direction artistique uniquement**. Ce document ne change aucun écran, aucun comportement et aucun actif utilisé par l’application.

## Direction artistique validée

- Style : petites illustrations éditoriales / miniatures à volume doux, proches de la maquette de référence.
- Palette : ivoire chaud, vert sauge, vert profond, doré mat.
- Matière : volumes lisibles, ombres douces, détails dessinés, reflets discrets.
- Fond : médaillon ou petite scène sur une forme ivoire/sauge très claire, pas un pictogramme de contour dans un cercle coloré.
- Cohérence : même lumière, angle, épaisseur de détail et niveau de finition pour toutes les catégories.
- Pas de logos de marques pour représenter une catégorie. Les marques d’abonnement restent des marques uniquement quand l’utilisateur choisit réellement un service.
- Les icônes fonctionnelles (retour, modifier, supprimer, calendrier, navigation) restent sobres et simples : on ne transforme pas les commandes en illustrations décoratives.

## Inventaire actuel à couvrir

### Catégories de budget
Les catégories reconnues par le code ont aujourd’hui un rendu mixte : six illustrations SVG personnalisées dans `categoryArtwork`, des pictogrammes de trait dans `categoryIcon` / `uiIcon`, et des emojis pour certaines catégories personnalisées ou de secours.

| Famille | Illustration cible |
|---|---|
| Logement / maison | Petite maison chaleureuse, toit texturé, fenêtres, deux plantes |
| Vie quotidienne / courses | Panier garni, feuilles et produits simples |
| Transport / voiture | Petite voiture en trois-quarts, carrosserie sauge, vitres claires |
| Abonnements / téléphone | Petit objet de service numérique, écran et détail doré ; pas de logo de marque générique |
| Loisirs / sorties | Objet évocateur des loisirs (ticket / jeu), palette terre cuite et sauge |
| Santé / bien-être / beauté | Flacon ou trousse de soin, verre dépoli et détails doux |
| Famille / enfants | Petit objet chaleureux et non genré, sans visage caricatural |
| Animaux | Petit bol et silhouette de patte, sans emoji |
| Éducation | Livre empilé ou carnet avec crayon |
| Cadeaux | Boîte emballée avec ruban textile |
| Vêtements | Vêtement plié en textile, couleur sourde |
| Sport / fitness | Accessoire sportif stylisé, sans marque |
| Technologie / informatique | Ordinateur ou téléphone en volume doux |
| Banque / finances / factures | Portefeuille ou document avec pièce dorée |
| Épargne / patrimoine | Petit bocal ou pile de pièces discrète |
| Voyage | Petite valise et étiquette |
| Mariage / objectifs | Alliances et détail végétal ; les objectifs peuvent aussi employer une vraie photo |
| Transport collectif | Petit bus, même perspective que la voiture |
| Catégorie personnalisée / inconnue | Illustration neutre réutilisable, jamais un emoji aléatoire |

### Abonnements
La grille de sélection d’abonnements est un cas à part : garder les logos de marques officiels uniquement pour les services nommés et sélectionnables. Tous les services génériques (« Autre », téléphone, internet, stockage, livraison, salle de sport) reçoivent des mini-illustrations Upvanta dans le style commun. Ne pas inventer de logos ni imiter les marques.

### Objectifs
Les objectifs personnels (voyage, voiture, maison, mariage, réserve de sécurité, achat personnalisé) devraient privilégier une photographie ou une illustration éditoriale dédiée, avec le même traitement de couleurs. Éviter de réutiliser le pictogramme de catégorie comme couverture principale.

### Navigation et actions
Les commandes (Budget, Activité, Objectifs, Stats, Patrimoine, calendrier, paramètres, modifier, supprimer, ajouter, retour) sont des icônes fonctionnelles, pas des logos de catégorie. Les garder minimalistes, mais les uniformiser dans une même famille de traits, taille optique et contraste. Le bouton Ajouter reste une action identifiable.

### Écran de bienvenue
Remplacer à terme les petits glyphes génériques des bénéfices par trois mini-illustrations très simples, dérivées du système commun : aperçu financier, suivi des dépenses, objectifs. Garder la grande illustration végétale/téléphone comme illustration principale.

## Règles d’intégration à respecter plus tard

1. Créer une bibliothèque d’actifs séparée, avec des noms stables et un fallback unique.
2. Ne pas changer le nom des catégories, leur logique, leurs budgets ou leurs identifiants.
3. Ne pas changer les écrans ni la disposition pendant la première passe d’actifs.
4. Remplacer les visuels uniquement après validation d’une planche complète de style.
5. Vérifier les tailles réelles dans une petite ligne de catégorie et dans une carte plus grande.
6. Contrôler les doublons SVG, les identifiants SVG internes (gradients uniques par illustration), les emojis résiduels et les actifs inutilisés.
7. Audit anti-doublon obligatoire avant chaque nouvelle série de modifications.

## Ordre de production proposé

1. Planche test : logement, courses, voiture, abonnements, loisirs, soin.
2. Valider le style avant de dessiner les familles restantes.
3. Compléter les catégories rares et les catégories personnalisées.
4. Créer la série séparée pour les abonnements et objectifs.
5. Préparer le mapping des icônes de navigation/actions sans les illustrer en 3D.
6. Seulement après validation explicite, brancher la bibliothèque dans l’application.
