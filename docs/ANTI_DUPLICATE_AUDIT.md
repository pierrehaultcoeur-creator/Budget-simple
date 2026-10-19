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
- Validation : [Build ESMA #367](https://github.com/pierrehaultcoeur-creator/Budget-simple/actions/runs/39153358094) a réussi sur le commit de code `6e5e2388953ad06301d64e8a6d17f88bad905dd8` ; le catalogue généré a été commité automatiquement en `8be1f0ee91cb0f853003dd8b68221f9ce1fb812a`. Le premier affichage CI #169 indiquait `action_required`, mais l'inspection de la tentative la plus récente confirme le succès de toutes les étapes : [CI #169](https://github.com/pierrehaultcoeur-creator/Budget-simple/actions/runs/39154209789).


## Contrôle de la branche avant toute fusion
- État au 18 octobre 2026 : PR #2 toujours ouverte en brouillon, non fusionnée ; branche à 529 commits d'avance sur `main`, 0 en retard, 185 fichiers modifiés.
- Risque bloquant de revue : cette taille rend une fusion globale inadaptée sans audit de portée et de provenance des commits. Ne pas fusionner ni déclarer la phase obligations terminée tant que les commits et les fichiers de la PR n'ont pas été réconciliés avec l'objectif limité de recherche des obligations.
- Aucun nouveau workflow n'a été lancé pour cette mise à jour documentaire ; les tests validés sur le commit concerné ne sont pas relancés sans changement de code.


## Audit anti-doublon — 19 octobre 2026 (suite ESMA bulk)
- Contrôle avant action : vérification des runs, de leurs SHA, des étapes exécutées, du workflow modifié et du registre existant. Aucun besoin de relancer les tests du commit exact après le succès CI.
- [Bond search CI #188](https://github.com/pierrehaultcoeur-creator/Budget-simple/actions/runs/39242629239) : SUCCESS sur `dfdc211ba229becced4830e1a6045a9e1c314e1c`. Toutes les étapes listées ont réussi, dont tests catalogue/index, recherche ISIN et syntaxe JavaScript.
- [Build ESMA bond catalogue #39242616089](https://github.com/pierrehaultcoeur-creator/Budget-simple/actions/runs/39242616089) : SUCCESS sur `2fd81f16cd2ad73e8a411c692d845de1f2ca1c13`. Ce run valide l'ancien workflow de construction (tests parser, génération, shards/index, audit qualité et recherche), pas le nouveau workflow isolé ESMA.
- Correction de workflow en `dfdc211ba229becced4830e1a6045a9e1c314e1c` : les chemins inexistants `engine/...` ont été remplacés par les scripts et tests présents dans `scripts/` et `tests/`. Le nouvel import écrit son aperçu sous `run-v38-esma-audit/`, avec vérifications ISIN uniques, compteurs cohérents et artefact de rapport ; il ne doit pas modifier le catalogue canonique.
- Validation restante : le nouveau workflow ESMA utilise uniquement `workflow_dispatch` et un calendrier hebdomadaire ; aucun run n'a encore validé cette version précise du workflow. Le connecteur disponible permet de lire les runs mais ne propose pas de déclenchement manuel du workflow. Ne pas présenter ce point comme validé et ne pas relancer un run ancien en prétendant tester le nouveau fichier.
- État de portée : PR #2 reste ouverte en brouillon et non fusionnée. Au dernier relevé, elle compte 550 commits, 186 fichiers modifiés, dont de nombreux fichiers de données d'index générés. L'audit de portée/provenance reste un blocage distinct avant toute fusion ; aucune fusion ni mise en production.
