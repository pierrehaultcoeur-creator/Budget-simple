# Upvanta — règle d'audit anti-doublon

Cette règle est obligatoire avant et après chaque session de développement.

## Avant toute modification
- Lire le dernier état du registre de tâches et du code concerné.
- Examiner les commits, tests et workflows existants liés à la tâche.
- Rechercher si la fonctionnalité, le contrôle ou la correction existe déjà.
- Marquer chaque point : terminé et vérifié, partiel, à faire ou bloqué.
- Ne pas refaire un contrôle déjà valide si aucun code ou aucune donnée pertinente n'a changé.

## Après chaque modification
- Vérifier le diff et noter le commit, le résultat du test et le risque restant.
- Contrôler les runs du commit exact. Un numéro de run ne constitue pas une avancée.
- Distinguer les runs réussis, échoués, annulés et doublons.
- Ne pas relancer toute la batterie sans justification précise.
- Mettre à jour le registre et le pourcentage uniquement lorsqu'un livrable distinct est réellement achevé.

## Règles de travail
- Travailler de manière concise, organisée et par étapes.
- Une modification doit fermer un manque précis identifié par l'audit.
- En cas d'échec, diagnostiquer l'étape fautive avant de relancer.
- La PR #2 reste ouverte en brouillon ; aucune fusion ni mise en production sans instruction explicite.

## Audit du 18 octobre 2026
- Le dépôt indiquait 547 runs au total ; 513 étaient recensés sur la branche `feature/bond-search-index`.
- Sur cette branche : 300 succès, 150 annulations et 63 échecs.
- 74 groupes comportaient plusieurs exécutions du même workflow sur le même SHA, souvent à cause des événements push et pull_request.
- Les workflows ont été ajustés pour réduire ces répétitions : le CI de recherche ne se déclenche plus sur les pushes de la branche de travail ; la construction du catalogue ne se déclenche plus sur pull_request et ne surveille plus les fichiers de catalogue générés.
- Validation après correction : Bond search CI #165 réussi et Build ESMA bond catalogue #365 réussi, sur le commit `34f9160a75ab7c5312d1192c5300a33c58b1ec62`.

## État de validation
Les contrôles intégrés du commit ci-dessus ont tous réussi : tests Python du catalogue et des index, tests de recherche des obligations, et syntaxe JavaScript de `index.html` et `investissement.html`. La phase obligations reste ouverte jusqu'à réconciliation complète du registre de tâches, pas parce qu'il faut répéter les tests déjà réussis.


## Audit anti-doublon — suite du 18 octobre 2026
- Avant modification : le commit `f6e04543d1f3958c64f62a7ef738b8484bb4d9eb` contenait déjà l'audit des 15 coupons DB suspects et le mécanisme de corrections par ISIN ; aucune correction globale ni nouveau test générique n'était nécessaire.
- Vérification ciblée : le registre officiel des prospectus approuvés de la Central Bank of Ireland confirme les coupons de 5,468 % et 5,611 % des deux émissions Netcity. Les noms d'instruments ESMA associent ces conditions d'émission aux ISIN `XS3420465927` et `XS3420466065`.
- Modification limitée : deux corrections individuelles sourcées, conservation des valeurs brutes ESMA et test de régression pour les deux ISIN. Aucun changement au moteur de normalisation, aucun déploiement, aucune modification de `main`.
- Validation à suivre : CI et reconstruction du catalogue sur le nouveau commit ; ne pas compter cette tâche comme validée avant succès des runs exacts.
