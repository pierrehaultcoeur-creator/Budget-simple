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


## Audit anti-doublon — déclenchement de la validation ESMA en PR (19 octobre 2026)
- [Bond search CI #39244622488](https://github.com/pierrehaultcoeur-creator/Budget-simple/actions/runs/39244622488) : SUCCESS sur `c51106e6f2299574159033bcf71c91c07ae1837b`; les étapes du job ont toutes réussi. Aucun besoin de relancer ce SHA.
- Manque constaté : le workflow ESMA corrigé n'avait que les déclencheurs manuel et hebdomadaire ; aucun outil connecté ne permet de lancer directement le workflow_dispatch.
- Correction ciblée : commit `8abcc40863045719a06564ca0509b902146f8a64` ajoute un déclencheur `pull_request` limité aux changements du workflow ESMA, aux deux scripts concernés et aux tests. Le catalogue d'essai reste isolé sous `run-v38-esma-audit/`; aucun droit d'écriture sur le dépôt n'est accordé au job.
- Runs sur ce commit au moment de l'audit : [Bond search CI #39245751733](https://github.com/pierrehaultcoeur-creator/Budget-simple/actions/runs/39245751733) et [ESMA FIRDS bulk bond import #39245751814](https://github.com/pierrehaultcoeur-creator/Budget-simple/actions/runs/39245751814) en cours. Le nouveau workflow ESMA est désormais réellement lancé sur la PR ; attendre son résultat avant de déclarer la validation terminée.
- Audit de portée inchangé : PR #2 reste ouverte en brouillon, non fusionnée ; les 551 commits / 186 fichiers indiquent toujours qu'une réconciliation de portée et de provenance est requise avant toute fusion.

## Audit anti-doublon — validation finale des runs ESMA (19 octobre 2026)
- Contrôle avant action : consultation des derniers runs de la branche, des SHA exacts, de chaque étape et des artefacts. Les deux workflows les plus récents sont terminés sur le SHA `d614f8626157a8d0e66ee7efa708aefaef60d222`.
- [Bond search CI #39245808184](https://github.com/pierrehaultcoeur-creator/Budget-simple/actions/runs/39245808184) : SUCCESS. Toutes les étapes ont réussi, y compris les tests hors ligne, la complétude de l'index de noms, les régressions de recherche et la syntaxe JavaScript.
- [ESMA FIRDS bulk bond import #39245808016](https://github.com/pierrehaultcoeur-creator/Budget-simple/actions/runs/39245808016) : SUCCESS. Les tests hors ligne, la génération isolée du catalogue d'aperçu, les contrôles d'audit et l'envoi de l'artefact ont tous réussi. Artefact `esma-firds-bond-audit-4` disponible jusqu'au 18 novembre 2026 (17,871,446 octets). L'artefact a bien été créé ; son contenu détaillé n'a pas été extrait par le connecteur, donc ne pas prétendre avoir relu chaque ligne du rapport.
- [Bond search CI #39245751733](https://github.com/pierrehaultcoeur-creator/Budget-simple/actions/runs/39245751733) : CANCELLED sur le SHA antérieur `8abcc40863045719a06564ca0509b902146f8a64`. Il a été remplacé par le run CI réussi #39245808184 sur le SHA plus récent ; il ne constitue pas un échec de test.
- [ESMA FIRDS bulk bond import #39245751814](https://github.com/pierrehaultcoeur-creator/Budget-simple/actions/runs/39245751814) : SUCCESS sur le SHA antérieur ; le run ESMA le plus récent #39245808016 a également réussi sur le SHA courant.
- Conclusion de validation : les deux workflows sont verts sur le SHA courant au moment du contrôle. Aucun nouveau run n'est nécessaire pour ces mêmes contrôles sans changement de code pertinent. Cette mise à jour ne touche qu'à la documentation et le filtre de chemins des workflows ne la déclenche pas.
- Risque restant, indépendant des tests : la PR #2 reste ouverte en brouillon avec 553 commits et 186 fichiers modifiés. L'audit de portée/provenance et la réconciliation avec l'objectif limité de recherche des obligations restent à faire avant toute fusion. Aucune fusion ni mise en production.

## Audit anti-doublon — portée du diff de la PR #2 (19 octobre 2026)
- Avant action : réutilisation des résultats des runs verts #39245808184 et #39245808016 ; aucun test de code relancé. Inspection de l'inventaire complet des 186 fichiers du diff GitHub.
- Répartition observée : 169 fichiers sous `data/bonds-catalog/` (index ISIN, index de noms, shards et manifeste générés), 3 workflows, 4 scripts, 4 fichiers de tests, 2 fichiers HTML, 2 fichiers sous `netlify/functions/`, 1 fichier de service worker et ce journal d'audit. Les catégories totalisent 186 fichiers.
- Adéquation apparente au périmètre : les index et shards servent au catalogue de recherche ; les workflows, scripts et tests portent sur la génération, l'audit et la recherche ; `investissement.html` ajoute l'interface de recherche et `index.html` l'intègre. Aucun fichier manifestement étranger à la fonction n'a été identifié dans l'inventaire des fichiers modifiés.
- Réserve importante : cette vérification est une revue de portée des fichiers du diff, pas une validation ligne par ligne de chacun des 553 commits ni une preuve indépendante de provenance de toutes les données générées. Les 169 fichiers de données doivent rester considérés comme des artefacts générés et être reliés à la source/catalogue ESMA et aux scripts de génération avant fusion. Les éventuelles corrections manuelles de coupons doivent rester traçables par ISIN et source.
- Statut : audit de portée préliminaire effectué ; audit complet de provenance des commits/données encore ouvert. PR #2 reste en brouillon et non fusionnée. Ne pas réduire le risque restant au seul nombre de fichiers et ne pas fusionner sans instruction explicite.

## Audit anti-doublon — garde-fou sur les corrections manuelles de coupons (19 octobre 2026)
- Avant modification : inspection de `scripts/bond_coupon_overrides.json` et des tests existants. Les 12 corrections possèdent actuellement un ISIN, une valeur de coupon, une justification et une URL HTTPS ; toutefois, les tests précédents ne contrôlaient pas automatiquement la complétude de toutes les entrées.
- Modification ciblée : ajout de `test_every_coupon_override_has_complete_provenance_and_valid_rate` dans `tests/test_bonds_catalog.py`. Le test impose pour chaque correction un ISIN de forme valide, une justification non vide, une URL HTTPS, un coupon numérique fini et compris entre -100 et 100. Il ne prouve pas à lui seul que la source web confirme le coupon : cette vérification de fond doit rester fondée sur la source et l'ISIN exacts.
- Commit : [`dc0db04`](https://github.com/pierrehaultcoeur-creator/Budget-simple/commit/dc0db04bc2d5a9f17cc0a2ae47561033b8c9c729).
- Validation après modification : au moment de l'audit, le workflow `Build ESMA bond catalogue` #39287204209 est en attente sur le nouveau SHA `dc0db04bc2d5a9f17cc0a2ae47561033b8c9c729`. Les runs #39286980517 (Bond search CI) et #39286980497 (ESMA FIRDS bulk import) sont encore en attente sur le SHA précédent `bedd7e2...`; ils ne valident donc pas le nouveau test. Ne pas annoncer la validation avant un run sur le SHA courant.
- Pas de nouvelle modification des données de coupons : aucune valeur n'a été ajoutée, supprimée ou devinée. La PR #2 reste ouverte en brouillon, sans fusion.
