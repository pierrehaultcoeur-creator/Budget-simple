
## V17.1 — Séparation Bilans / Réglages
- Ajout d’une section **📊 Bilans** directement sur la page budget.
- Accès séparé au dernier bilan mensuel et au bilan annuel.
- Retrait des boutons de bilan de la fenêtre **⚙️ Réglages** : celle-ci ne contient plus que la configuration du cycle budgétaire.
- Interface et textes ajoutés en français, portugais et anglais.
- Cache PWA incrémenté pour garantir la prise en compte de la nouvelle interface.

## V17 — bilan annuel finalisé
- Bilan annuel présenté dans un pop-up compact, cohérent avec le bilan de fin de cycle.
- Déclenchement automatique au début de l’année pour le dernier exercice terminé, sans dépendre d’une ouverture quotidienne de l’application.
- Vue annuelle avec total dépensé, moyenne mensuelle, nombre de dépenses et moyenne par dépense.
- Évolution des 12 cycles, avec variantes adaptées aux cycles personnalisés.
- Temps forts : mois/cycle le plus dépensier, mois/cycle le moins dépensier et plus grosse dépense.
- Top 5 des catégories avec montant et part du total annuel.
- Statistiques complémentaires et comparaison avec l’année précédente lorsque les données existent.
- Détection des catégories en hausse/baisse uniquement lorsqu’une comparaison précédente est disponible.
- Conclusion coaching dans le même esprit que le bilan mensuel.
- Accès au dernier bilan annuel depuis les réglages.
- FR / EN / PT conservés.


## v10 — Clarté du formulaire de dépense
- Le montant indicatif est maintenant explicitement marqué comme « facultatif » dans les 3 langues.
- Les choix de période précisent « cycle mensuel » pour mieux expliquer le fonctionnement des cycles personnalisés.
# Budget simplement — V8

## Ajout
- Période concernée pour chaque dépense : « Ce cycle » ou « Cycle suivant ».
- Une dépense payée maintenant peut ainsi être rattachée au cycle suivant sans modifier le reste du fonctionnement.
- Lorsqu’une dépense est déplacée vers le cycle suivant, elle est retirée du cycle actuel pour éviter les doublons.
- Le choix est conservé par ligne comme préférence pratique, tout en restant modifiable.
- Traductions ajoutées en français, portugais et anglais.

## Préservation
- `manifest.webmanifest` inchangé.
- `sw.js` inchangé.
- Icônes PWA inchangées.
- Le cycle budgétaire personnalisable de V7 est conservé.
- Les économies potentielles et les autres fonctionnalités existantes sont conservées.


## V9 — Dépenses à montant variable
- Ajout de l’option « Le montant change selon les mois ».
- Les dépenses variables ne gonflent plus artificiellement le budget prévu de leur catégorie.
- Le montant saisi reste un montant indicatif et le réel dépensé reste affiché.
- La fonctionnalité est disponible en français, portugais et anglais.
- Les dépenses variables récurrentes ne sont pas utilisées pour calculer les économies potentielles.
## V15 — bilan automatique de fin de cycle
- Le bilan de fin de cycle n’est plus un mode test.
- À l’ouverture de l’application, le dernier cycle terminé est détecté automatiquement.
- Le cycle utilisé est le cycle personnalisé choisi par l’utilisateur ; le jour 1 conserve le cycle calendaire classique.
- Le bilan concerne bien le cycle terminé, même lorsque l’application n’a pas été ouverte le jour exact de fin.
- Le cycle en cours est automatiquement repositionné après le changement de cycle.
- Le dernier bilan reste consultable depuis les réglages.
