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

### Correction avant validation du garde-fou coupons
- Relecture de la nouvelle assertion avant résultat CI : une expression régulière trop échappée aurait rejeté les taux valides. Le défaut a été corrigé immédiatement dans le commit [`087940b`](https://github.com/pierrehaultcoeur-creator/Budget-simple/commit/087940b3739d1116422ee81d347fc2803cd2edfc), avant toute déclaration de succès. Aucun résultat de test n'a été présenté comme valide à tort.
- Runs déclenchés sur le SHA de code corrigé : [Bond search CI #39287312701](https://github.com/pierrehaultcoeur-creator/Budget-simple/actions/runs/39287312701), [ESMA FIRDS bulk bond import #39287312902](https://github.com/pierrehaultcoeur-creator/Budget-simple/actions/runs/39287312902) et [Build ESMA bond catalogue #39287300041](https://github.com/pierrehaultcoeur-creator/Budget-simple/actions/runs/39287300041). Ils étaient en attente lors du dernier contrôle. Les exécutions plus anciennes sur les SHA précédents ne valident pas ce correctif.
- Anti-doublon : ne pas relancer ces workflows manuellement ; attendre et lire les résultats déjà en file, puis retenir uniquement les runs pertinents sur le code corrigé.

## Règle impérative — récapitulatif global AVANT tout travail
- Cette étape est obligatoire au début de CHAQUE session de travail, avant toute programmation, modification de fichier, commit, lancement de run ou nouvelle vérification.
- Reconstituer l'état global actuel du projet à partir du registre, du code, des fichiers, de l'historique des commits, des tests, des workflows et des runs existants. Ne pas se contenter du dernier message de conversation.
- Produire un récapitulatif concis et vérifiable : éléments terminés et validés, éléments partiels, éléments en attente/échoués/annulés, problèmes ouverts, risques, contraintes et travaux déjà tentés.
- Faire la recherche de doublons PENDANT ce récapitulatif : comparer les besoins restants aux fonctions, données, scripts, tests, commits et validations déjà présents. Classer les éléments « terminé et vérifié », « partiel », « à faire » ou « bloqué ».
- Seulement après ce récapitulatif et cette comparaison, choisir la prochaine action utile qui ferme un manque réel non déjà traité. Si aucun manque distinct n'est démontré, ne rien coder et ne pas lancer de run inutile.
- Présenter à l'utilisateur le récapitulatif et la prochaine action proposée AVANT de commencer l'implémentation. Ne pas faire d'abord le travail puis auditer les doublons après coup : l'audit après intervention complète l'audit préalable, il ne le remplace jamais.
- À chaque reprise dans une nouvelle conversation ou après interruption, refaire ce récapitulatif à partir de l'état réel du dépôt. Ne pas supposer que la mémoire conversationnelle est exhaustive ni demander à l'utilisateur de rappeler ce qui est déjà dans le projet.
- Après intervention seulement : inspecter le diff, consigner les résultats, relier les runs au SHA exact et mettre à jour ce registre. Aucun merge ni déploiement sans autorisation explicite.

## Audit anti-doublon — correction d'une source de coupon obsolète (19 octobre 2026)
- Audit préalable effectué : récapitulatif global du dépôt, registre, PR #2, commits récents, runs et 12 corrections de coupons consultés avant toute modification.
- Manque confirmé : la source Borsa Italiana de l'ISIN `GR0118019679` redirigeait vers une page générique. Une notice officielle d'Athens Exchange identifie cet ISIN et confirme le taux fixe annuel de 1,875 %.
- Correction ciblée dans `scripts/bond_coupon_overrides.json` : remplacement de la justification et de l'URL obsolète par la notice officielle ATHEX. Les 12 entrées et toutes les valeurs de coupons sont inchangées.
- Commit : [`b781ec7`](https://github.com/pierrehaultcoeur-creator/Budget-simple/commit/b781ec79ca386864efb70a7f72f6f3a0677a0701). Diff vérifié : une seule entrée de données modifiée, deux lignes.
- Validation : [Build ESMA #39290733594](https://github.com/pierrehaultcoeur-creator/Budget-simple/actions/runs/39290733594) en attente sur le SHA exact `b781ec79ca386864efb70a7f72f6f3a0677a0701`. Ne pas annoncer de succès avant la fin du run.
- Les sources publiques consultées corroborent plusieurs entrées, notamment ATHEX pour les coupons grecs, Börse Stuttgart pour `XS1722899918`, Cbonds pour `XS3262577961`, Erste Group pour `GR0114031561` et les titres du registre Central Bank of Ireland pour les deux émissions Netcity. L'audit documentaire exhaustif des 12 correspondances ISIN/coupon reste ouvert.
- Aucun run manuel ajouté. PR #2 reste ouverte en brouillon ; pas de merge ni de déploiement.

## Audit anti-doublon — source officielle pour le coupon GR0118017657 (19 octobre 2026)
- Audit préalable avant modification : relu le registre, la branche, la PR #2, les 12 overrides et les runs en attente. Aucun changement existant pour cette source dans le diff récent.
- Vérification documentaire : la notice officielle d'Athens Exchange identifie l'ISIN `GR0118017657` et confirme un coupon fixe annuel de 3,375 % : https://www.athexgroup.gr/en/documents/10180/4959576/HELLENIC%20REPUBLIC%20-%20LISTING%20OF%20NEW%20BOND%2015%20-%2002%20-%202018/03f99d76-75e7-47c7-90ab-4b2fae7904d0.
- Modification limitée : remplacement de la source secondaire Bondfish par la notice officielle ATHEX et précision de la justification. La valeur `3.375` n'a pas changé ; aucune entrée ajoutée ou supprimée.
- Commit : [`3f1727f`](https://github.com/pierrehaultcoeur-creator/Budget-simple/commit/3f1727f300ffafc5cea80afeba696cfb9660634c).
- Autres contrôles documentaires effectués sans modification : ATHEX confirme `GR0118019679` à 1,875 % et les cinq ISIN `GR0128010676`, `GR0128011682`, `GR0128012698`, `GR0128013704`, `GR0128014710` à 2,000 % dans les noms de titres de sa table officielle; Erste Group Research associe `GR0114031561` à 3,450 %; Börse Stuttgart confirme `XS1722899918` à 1,125 %; Cbonds associe `XS3262577961` à l'émission Development Bank of Japan 4,375 %; le registre officiel Central Bank of Ireland confirme les titres/coupons des deux émissions Netcity.
- Limite restante : les pages Central Bank of Ireland consultées montrent le titre et le coupon des émissions Netcity mais pas l'ISIN dans le texte indexé. La correspondance exacte ISIN/prospectus doit être confirmée via les documents d'émission/termes finaux avant de déclarer ces deux entrées pleinement vérifiées.
- Validation post-modification : ne pas réutiliser comme preuve des runs antérieurs à `3f1727f`. Attendre les runs automatiques déclenchés par le commit de données et relever leur SHA exact. Aucun run manuel lancé ; PR #2 reste ouverte en brouillon, aucun merge ni déploiement.


## Audit anti-doublon — conflit du build catalogue et recontrôle Netcity (19 octobre 2026)
- Audit préalable : registre, PR #2, branche, workflow `.github/workflows/bonds-catalog.yml`, 12 corrections de coupons et derniers runs consultés avant toute modification.
- État confirmé : HEAD de la branche au début de cette vérification = `5e89b92ca11a5fd93933c511442e4e8d29de1791`, commit automatique `Update ESMA bond catalogue` qui modifie seulement `data/bonds-catalog/manifest.json` et `data/bonds-catalog/part-0032.json`.
- Analyse de l'échec [Build ESMA #39290963352](https://github.com/pierrehaultcoeur-creator/Budget-simple/actions/runs/39290963352), lancé sur le SHA antérieur `3f1727f300ffafc5cea80afeba696cfb9660634c` : tests hors ligne, téléchargement/construction du catalogue, validation des shards, tests de recherche et syntaxe JavaScript ont réussi. L'étape de commit a échoué au rebase après l'arrivée du commit automatique `5e89b92`, avec conflits dans le manifeste et `part-0032.json`. Le workflow ne résout automatiquement que le conflit du manifeste et refuse, de façon conservatrice, d'écraser un shard concurrent.
- Contrôles déjà disponibles sur le HEAD `5e89b92` : [Bond search CI #39292110136](https://github.com/pierrehaultcoeur-creator/Budget-simple/actions/runs/39292110136) et [ESMA FIRDS bulk import #39292110114](https://github.com/pierrehaultcoeur-creator/Budget-simple/actions/runs/39292110114) sont réussis. Pas de relance manuelle : le build en échec n'est pas sur le HEAD courant et son étape de génération avait réussi ; le catalogue a ensuite été publié par le commit automatique plus récent.
- Contrôle documentaire Netcity : recherches ciblées sur `XS3420465927` et `XS3420466065` n'ont pas trouvé de document public indexé reliant explicitement chaque ISIN au prospectus/termes finaux. Les deux pages officielles Central Bank of Ireland confirment les titres et coupons `5.468%` et `5.611%`, mais leur texte visible ne donne pas les ISIN. La correspondance exacte reste donc **non vérifiée** ; aucune valeur ni entrée n'a été modifiée ou supprimée.
- Anti-doublon : pas de correction de workflow ni de nouveau run dans cette étape ; ne pas répéter les contrôles réussis sur le HEAD. Le conflit concurrent reste une amélioration potentielle distincte. PR #2 reste ouverte en brouillon, sans fusion ni déploiement.

## Audit anti-doublon — prévention des builds catalogue sur SHA périmé (19 octobre 2026)
- Audit préalable : le registre et le workflow catalogue ont été relus après confirmation du conflit du run #39290963352. Le run était parti sur `3f1727f` alors que la branche a avancé vers le commit de données `5e89b92` avant l'étape de push ; les contrôles de construction ont réussi, seul le rebase/commit a échoué.
- Manque distinct confirmé : un run en attente peut commencer avec le SHA d'événement ancien même si la branche a avancé entre-temps. Le commit catalogue plus récent ne doit jamais être écrasé automatiquement.
- Correction minimale dans `.github/workflows/bonds-catalog.yml` : l'étape checkout utilise maintenant `ref: ${{ github.ref_name }}`, afin de résoudre la branche à l'exécution du job au lieu de reprendre aveuglément le SHA ancien de l'événement. Le refus conservateur des conflits de shard reste en place ; aucun mécanisme ne force l'écrasement de données générées concurrentes.
- Commit de code : [e52ccf1](https://github.com/pierrehaultcoeur-creator/Budget-simple/commit/e52ccf1be1353774a46f8767168e1d5bac990bbd). Aucune correction des données de catalogue ni des 12 valeurs de coupon.
- Validation : attendre les workflows automatiques sur le SHA de correction et vérifier les liens de runs exacts ; ne pas déclencher de run manuel. Les validations antérieures sur `5e89b92` ne prouvent pas encore le comportement du nouveau checkout.
- PR #2 reste ouverte en brouillon, sans fusion ni déploiement.

## Suivi de validation — prévention des builds catalogue sur SHA périmé (19 octobre 2026)
- Résultats après le commit de correction `e52ccf1be1353774a46f8767168e1d5bac990bbd` : [Build ESMA bond catalogue #39295804679](https://github.com/pierrehaultcoeur-creator/Budget-simple/actions/runs/39295804679) **réussi** sur ce SHA. Les étapes de tests hors ligne, génération, validation des shards/index, recherche, syntaxe JS et commit des shards ont toutes réussi.
- Les workflows de recherche et d'import ont également réussi sur le SHA `ed2a304c618d792fd05abeef0a4ca80d384d9aca` : [Bond search CI #39297226486](https://github.com/pierrehaultcoeur-creator/Budget-simple/actions/runs/39297226486) et [ESMA FIRDS bulk import #39297226581](https://github.com/pierrehaultcoeur-creator/Budget-simple/actions/runs/39297226581). Ce SHA est un commit automatique de catalogue postérieur à la correction.
- État actuel observé : PR #2 toujours ouverte, brouillon, non fusionnée ; HEAD `ed2a304c618d792fd05abeef0a4ca80d384d9aca`. Aucune relance manuelle.
- La modification checkout sur `github.ref_name` a donc passé le build catalogue sur le SHA de code `e52ccf1`; le problème de conflit concurrent n'a pas été reproduit dans ce run. Ne pas conclure que tous les scénarios de concurrence sont impossibles, mais ne pas ajouter de complexité sans nouvelle preuve.
- Sources Netcity : deux recherches exactes d'ISIN n'ont retourné aucun document indexé supplémentaire. Les pages officielles CBI confirment le titre et le coupon, mais pas l'ISIN dans le texte public consulté. Correspondance exacte toujours non vérifiée ; aucune donnée modifiée.


## Audit anti-doublon — tentative via registre officiel ESMA pour les ISIN Netcity (19 octobre 2026)
- Audit préalable : registre, 12 overrides, workflow catalogue, PR #2 et runs récents relus. Les validations existantes restent réutilisées ; aucun run CI manuel n'est nécessaire pour cette recherche documentaire.
- Nouvelle piste officielle : le registre ESMA « Prospectus III Documents » permet en principe une recherche par ISIN et contient les prospectus, notes de titres et conditions définitives approuvés ou déposés dans l'EEE : https://registers.esma.europa.eu/publication/searchRegister?core=esma_registers_priii_documents.
- Résultat : l'interface consultable renvoie « Captcha is incorrect » et ne fournit aucun résultat exploitable pour relier explicitement `XS3420465927` et `XS3420466065` aux documents finaux. Les pages officielles CBI continuent de confirmer les titres/coupons, sans montrer l'ISIN dans le texte accessible : 5.468 % et 5.611 % respectivement. Sources : https://www.centralbank.ie/regulation/industry-market-sectors/securities-markets/prospectus-regulation/prospectuses/netcity-telecom-s.a.----15-000-000-5.468-per-cent.-secured-amortising-bonds-due-june-2046---20-july-2026 et https://www.centralbank.ie/regulation/industry-market-sectors/securities-markets/prospectus-regulation/prospectuses/netcity-telecom-s.a.----45-000-000-5.611-per-cent.-secured-amortising-bonds-due-december-2052---20-july-2026.
- Statut : correspondance ISIN/document définitif toujours **non vérifiée**. Aucun coupon modifié, aucune entrée ajoutée/supprimée, aucun test ni run relancé. Ne pas répéter à l'identique cette recherche ESMA tant que l'accès au registre reste bloqué ; les deux overrides restent en place mais doivent garder ce statut documentaire réservé.
- Prochaine tâche distincte : examiner le cas de taux variable `NO0012654534` (référence connue : NIBOR 3M + 305 points de base), en partant des champs bruts ESMA et d'une source primaire pertinente. Ne pas le traiter comme un coupon fixe ni appliquer une correction sans preuve sur l'ISIN exact.


## Audit anti-doublon — correction des métadonnées de taux variable Jyske Bank (19 octobre 2026)
- Audit préalable : les 12 corrections de coupons, les tests existants et le parseur ESMA ont été relus. Aucun override de taux variable n'existait ; les tests génériques couvrent déjà les éléments XML `Fltg`, mais pas un enregistrement où ESMA place une marge dans `Fxd` sans structure `Fltg`.
- Source primaire : les conditions définitives de Jyske Bank datées du 30 août 2022 identifient explicitement `NO0012654534` et spécifient « 3 month NIBOR + 3.05 per cent. » ; le même document donne une marge annuelle de +3,05 % et le code ISIN (pages 2–3 et 6). URL : https://jyskebank.com/wps/wcm/connect/jbc/dcdfbf5e-3b99-4847-83fb-bfb567ed19cf/Final%2BTerms%2BJyske%2B10NC5%2BNOK%2B400m%2BTier%2B2%2BAug%2B2022.pdf?CVID=obTXygg&MOD=AJPERES. La liste officielle Euronext Dublin identifie aussi le même ISIN comme les notes flottantes Tier 2 NOK 400m dues en août 2032 : https://live.euronext.com/sites/default/files/statistics/dol/DOL2025-07-18.pdf.
- Manque confirmé dans le catalogue généré : `couponRateRaw="305"`, `couponSourceField="Fxd"`, `couponRateStatus="SUSPICIOUS_SOURCE_VALUE"`, mais `floatingRateFieldPresent=false` et aucun index/terme/marge de taux variable. Le coupon utilisable était déjà nul ; le risque est l'absence de métadonnées fiables, pas un coupon fixe actuellement affiché.
- Modification ciblée : nouveau registre `scripts/bond_floating_rate_overrides.json` avec uniquement l'ISIN vérifié ; le parseur utilise ces données pour exposer `NIBOR`, `3M`, `305` bps, les sources et la justification, marque la fiche comme taux variable et conserve la valeur brute ESMA. Le coupon reste nul avec le statut `FLOATING_RATE_REFERENCE`. Aucun changement des 12 coupons fixes ni du catalogue brut ESMA.
- Tests ajoutés : régression ciblée sur le cas exact `Fxd=305` sans `Fltg` et contrôle de complétude/provenance du registre de taux variables. Ils complètent les tests génériques existants sans les dupliquer.
- Validation : exécuter les workflows automatiques déclenchés par ce commit et n'accepter que les runs sur son SHA ou un SHA de catalogue généré qui en descend. Aucun run manuel, aucun merge ni déploiement. PR #2 reste en brouillon.


### Revue anti-doublon du diff avant génération — métadonnées de taux variable
- Relecture du diff avant tout run : les champs de provenance du taux variable sont désormais ajoutés uniquement aux ISIN disposant d'un override vérifié. Cela évite d'ajouter des champs `null` à chacun des ~631 000 instruments et de provoquer un changement artificiel massif du catalogue généré.
- Le correctif est intégré dans le commit de suivi ci-dessous avant validation CI ; aucune génération de catalogue n'a été lancée manuellement.


### Contrôle de placement des tests avant validation
- La relecture du fichier a détecté que les deux tests spécifiques avaient été ajoutés après le bloc `unittest.main()` plutôt qu'à l'intérieur de `ParserTests`. Ils ont été replacés dans la classe avant le point d'entrée, avant toute validation CI ; les tests seront donc découverts par `unittest`.


## Audit anti-doublon — vérification du taux variable Jyske Bank dans le catalogue généré (20 octobre 2026)
- Contrôle avant toute nouvelle modification : historique de branche, parseur, registre de taux variable, tests, manifeste/index et runs consultés. Les deux tests ciblés sont dans `ParserTests`, avant `unittest.main()` ; aucun doublon de test à ajouter.
- Vérification du résultat généré sur le HEAD `5bf5684ca57e494566380593fc4dc37facfd78e9`, publication ESMA `20261017`, catalogue généré le `2026-10-19T18:48:52+00:00`. La fiche `NO0012654534` est bien présente dans `part-0033.json` et contient : `couponRate=null`, `couponRateRaw="305"`, `couponRateStatus="FLOATING_RATE_REFERENCE"`, `floatingRateFieldPresent=true`, `floatingRateRaw="NIBOR"`, `floatingRateTerm="3M"`, `floatingRateSpreadBps="305"`, avec URL et justification de source.
- Audit anti-doublon de portée : le shard contient 13 643 fiches, mais `floatingRateSource` et `floatingRateSourceReason` n'apparaissent chacun qu'une fois, pour cet override vérifié. Pas de champs de provenance ajoutés massivement aux autres fiches. Les 12 overrides de coupons fixes restent inchangés.
- Validations existantes réutilisées, sans relance manuelle : [Build ESMA #39304206096](https://github.com/pierrehaultcoeur-creator/Budget-simple/actions/runs/39304206096) réussi sur le SHA de code/tests `1065b0922c166a275732b46880da60885ee853dd`; [Bond search CI #39306997664](https://github.com/pierrehaultcoeur-creator/Budget-simple/actions/runs/39306997664) et [import ESMA #39306997626](https://github.com/pierrehaultcoeur-creator/Budget-simple/actions/runs/39306997626) réussis sur le SHA catalogue `5bf5684ca57e494566380593fc4dc37facfd78e9`, descendant du correctif. Les exécutions intermédiaires annulées ne sont pas comptées comme validations.
- Conclusion : correction ciblée présente dans les données générées et contrôles pertinents réussis. PR #2 toujours ouverte en brouillon, sans fusion ni déploiement. Aucune valeur de coupon fixe modifiée.


## Audit anti-doublon — présélection de fiches à taux variable (20 octobre 2026)
- État avant action : PR #2 ouverte en brouillon, non fusionnée ; HEAD contrôlé `60c88a64351500a6397a9dce6f947d008285642a`. Aucun correctif de données n'est appliqué dans cette étape.
- Réutilisation d'un audit déjà exécuté : le rapport qualité joint au run [Build ESMA #39304206096](https://github.com/pierrehaultcoeur-creator/Budget-simple/actions/runs/39304206096), succès sur le SHA de code/tests `1065b0922c166a275732b46880da60885ee853dd`, a déjà exposé les fiches avec coupon suspect. Aucun nouveau run n'est lancé.
- Après exclusion de Jyske Bank (`NO0012654534`), déjà corrigée et vérifiée dans le catalogue généré, 13 fiches dont le nom mentionne explicitement « Floating Rate Notes » restent à examiner. Leurs valeurs brutes ESMA sont conservées et leurs coupons utilisables sont nuls ; cette liste est une présélection, pas une confirmation que chaque valeur représente une marge :
  - `US03762XAE94` — valeur brute `786` — APIDOS CLO XXIV — Class E-R Junior Deferrable Floating Rate Notes.
  - `USG04883AD92` — valeur brute `786` — APIDOS CLO XXIV — Class E-R Junior Deferrable Floating Rate Notes.
  - `USG1351TAD49` — valeur brute `630` — BLUEMOUNTAIN CLO 2013-2 — Class E-R Senior Secured Deferrable Floating Rate Notes.
  - `USG1351UAH26` — valeur brute `130` — BLUEMOUNTAIN CLO 2013-2 — Class A-2-R Senior Secured Floating Rate Notes.
  - `USG1351UAJ81` — valeur brute `160` — BLUEMOUNTAIN CLO 2013-2 — Class B-R Senior Secured Floating Rate Notes.
  - `USG1351UAK54` — valeur brute `195` — BLUEMOUNTAIN CLO 2013-2 — Class C-R Senior Secured Deferrable Floating Rate Notes.
  - `USG1351UAL38` — valeur brute `290` — BLUEMOUNTAIN CLO 2013-2 — Class D-R Senior Secured Deferrable Floating Rate Notes.
  - `XS1538267490` — valeur brute `342` — CAIRN CLO VII — Class D Senior Secured Deferrable Floating Rate Notes.
  - `XS2074549820` — valeur brute `200` — ALHAMBRA SME FUNDING 2019-1 — Class A Residential Mortgage Backed Floating Rate Notes.
  - `XS2074551990` — valeur brute `1500` — ALHAMBRA SME FUNDING 2019-1 — Class E Residential Mortgage Backed Floating Rate Notes.
  - `XS2074554820` — valeur brute `1500` — ALHAMBRA SME FUNDING 2019-1 — Class Z1 Residential Mortgage Backed Floating Rate Notes.
  - `XS2113149236` — valeur brute `863` — MAN GLG EURO CLO VI — Class F Deferrable Junior Floating Rate Notes (Reg S).
  - `XS2113149319` — valeur brute `863` — MAN GLG EURO CLO VI — Class F Deferrable Junior Floating Rate Notes (144A).
- Contrôle anti-doublon : aucun nouvel override, aucune modification du parseur et aucun test de régression ajouté. Le registre `scripts/bond_floating_rate_overrides.json` contient toujours uniquement l'ISIN Jyske déjà sourcé.
- Piste documentaire : pour `XS2074549820`, la liste officielle Euronext Dublin confirme le caractère variable de l'instrument (`https://live.euronext.com/sites/default/files/statistics/dol/DOL2025-06-13.pdf`) ; un rapport de notation associe cet ISIN à `EUR1M + 2.00%` (`https://neprocrainformes.blob.core.windows.net/informes/20000013/1591/ALHAMBRA_SME_FUNDING_2019-1_DAC_REV_NOV_2020_V2_CLASS_C-ASFSFSCR-V22_0.pdf`). Le rapport de notation n'est pas une source primaire : aucune correction n'est autorisée sur cette seule base.
- Suite distincte : retrouver pour chaque candidat les conditions finales/prospectus ou autre source primaire identifiant explicitement l'ISIN et le taux de référence/marge ; ne corriger que les cas démontrés. Les 13 valeurs brutes ne sont ni converties ni réinterprétées par heuristique.
- Aucun workflow n'a été relancé pour cette seule mise à jour documentaire ; les contrôles existants sont réutilisés. PR #2 reste en brouillon, sans fusion ni déploiement.


## Audit anti-doublon — preuve primaire des spreads BlueMountain CLO 2013-2 (20 octobre 2026)
- Audit préalable : HEAD confirmé `8e653973b59a45a88d4b25884b02c08c0f71637d`, PR #2 ouverte en brouillon et non fusionnée. Le registre contient déjà les 13 candidats et l'unique override Jyske ; aucun nouvel override n'est créé dans cette étape.
- Source primaire trouvée : notice du trustee Bank of New York Mellon et supplément d'indenture exécuté le 23 octobre 2017, publié via London Stock Exchange RNS : https://www.rns-pdf.londonstockexchange.com/rns/6380U_-2017-10-25.pdf. Le tableau des conditions à la page 8 (page PDF 7) identifie le benchmark LIBOR à 3 mois et les spreads initiaux ; la notice identifie les ISIN Reg S exacts.
- Correspondances exactes établies dans cette source :
  - `USG1351TAD49` — classe E-R — 6,30 % (raw ESMA `630`).
  - `USG1351UAH26` — classe A-2-R — 1,30 % (raw `130`).
  - `USG1351UAJ81` — classe B-R — 1,60 % (raw `160`).
  - `USG1351UAK54` — classe C-R — 1,95 % (raw `195`).
  - `USG1351UAL38` — classe D-R — 2,90 % (raw `290`).
- Limite avant correction : la source est primaire pour les conditions de refinancement de 2017, mais elle précède la cessation du LIBOR. La recherche effectuée n'a pas permis de retrouver un supplément postérieur confirmant l'indice contractuel de remplacement actuellement applicable. Les marges concordent exactement avec les valeurs brutes ESMA, mais le champ de référence actuel ne doit pas être présenté comme certain avant vérification de ce point. Aucun changement de données, de parseur ou de tests dans cette étape.
- Piste secondaire distincte : les dépôts SEC de portefeuille confirment des taux variables/coupons courants pour certains titres, mais ne remplacent pas les documents contractuels pour établir l'indice de référence applicable ; ils ne sont pas utilisés comme base d'override.
- Runs existants réutilisés sur le HEAD audité : [ESMA FIRDS bulk bond import #39367556772](https://github.com/pierrehaultcoeur-creator/Budget-simple/actions/runs/39367556772) SUCCESS et [Bond search CI #39367556788](https://github.com/pierrehaultcoeur-creator/Budget-simple/actions/runs/39367556788) SUCCESS. Aucun run manuel supplémentaire lancé pour cette documentation.
- Prochaine action distincte : rechercher le supplément de benchmark transition/LIBOR fallback postérieur à 2017 pour BlueMountain CLO 2013-2. Ne créer les cinq overrides que lorsque le benchmark actuellement applicable est vérifié, tout en conservant les spreads prouvés et les valeurs brutes ESMA.
- PR #2 maintenue en brouillon ; aucune fusion ni mise en production.


## Audit anti-doublon — vérification du mécanisme LIBOR de BlueMountain CLO 2013-2 (20 octobre 2026)
- Contrôle préalable : le registre contient déjà les cinq ISIN BlueMountain et les spreads initiaux exacts trouvés dans la notice du trustee de 2017. La question restante n'est pas le spread, mais le benchmark actuellement applicable ; aucun nouvel override ni test n'est nécessaire avant preuve contractuelle.
- Source primaire relue sur le point ciblé : notice du trustee et supplément d'indenture exécuté le 23 octobre 2017, publié via London Stock Exchange RNS : https://www.rns-pdf.londonstockexchange.com/rns/6380U_-2017-10-25.pdf. La définition « LIBOR » prévoit qu'en cas de cessation, le Portfolio Manager peut choisir une « Alternative Rate » jugée cohérente avec le taux successeur généralement utilisé sur le marché CLO, sous réserve de consentement de la majorité de la classe contrôlante ou de satisfaction de la condition de notation. Le document ne nomme pas le taux de remplacement effectivement choisi.
- Recherche ciblée de suppléments/avis postérieurs nommant le benchmark de remplacement pour les ISIN USG1351TAD49, USG1351UAH26, USG1351UAJ81, USG1351UAK54 et USG1351UAL38 : aucun document contractuel ultérieur probant n'a été trouvé dans cette passe. Les informations générales ISDA sur les fallbacks ne prouvent pas le choix spécifique de l'émetteur et ne sont pas utilisées comme source de correction.
- Décision : **aucune correction de données**. Les marges initiales de 6,30 %, 1,30 %, 1,60 %, 1,95 % et 2,90 % restent documentées, mais le champ de référence actuel demeure non confirmé. Ne pas remplacer automatiquement LIBOR par SOFR sur la seule base d'une convention de marché.
- Anti-doublon : aucun nouveau test, aucune modification du parseur ou des données ; pas de nouveau run pour cette seule note documentaire. Les runs existants restent réutilisables uniquement pour le code/catalogue qu'ils ont effectivement validé.
- Suite distincte : chercher une notice de transition/consentement du trustee ou une version plus récente de l'indenture identifiant le taux réellement sélectionné. Si elle reste introuvable, conserver le benchmark comme non confirmé plutôt que d'inventer une valeur.


## Audit anti-doublon — recherche des conditions d'émission Alhambra SME Funding 2019-1 (20 octobre 2026)
- Audit préalable : relecture du registre anti-doublon et de la liste existante des 13 candidats. Le cas Alhambra porte déjà sur trois ISIN (XS2074549820, XS2074551990, XS2074554820) ; aucune nouvelle ligne de candidat, aucun override et aucun test générique ne sont nécessaires à ce stade.
- Source officielle consultée : la Central Bank of Ireland confirme l’existence du prospectus approuvé le 20 novembre 2019 couvrant les classes A, B, C, D, E, Z1 et Z2. La page publique accessible décrit le registre mais ne fournit pas, dans le contenu consultable, le lien direct aux conditions finales ni les clauses de taux par ISIN : https://www.centralbank.ie/regulation/industry-market-sectors/securities-markets/prospectus-regulation/prospectuses/alhambra-sme-funding-2019-1-dac---class-a-b-c-d-e-z1-and-z2-%2820-november-2019).
- La liste officielle Euronext Dublin confirme le caractère flottant et les ISIN des classes A et Z1 ; elle ne démontre pas à elle seule l’indice et la marge contractuels : https://live.euronext.com/sites/default/files/statistics/dol/DOL2025-06-13.pdf.
- Les rapports de notation accessibles indiquent pour la classe A (XS2074549820) une référence EURIBOR 1 mois + 2,00 %, mais ils restent des sources secondaires. Les recherches ciblées n’ont pas fait apparaître de conditions finales/prospectus primaires accessibles reliant explicitement les trois ISIN aux indices et marges. Pour les classes E (XS2074551990) et Z1 (XS2074554820), la valeur brute ESMA 1500 ne suffit notamment pas à conclure à une marge de 15,00 %.
- Décision : **aucune correction de données**. Les valeurs brutes restent intactes, aucun benchmark ni spread n’est ajouté et aucun test ou run n’est relancé pour cette recherche documentaire. La preuve primaire exacte reste un point bloqué ; ne pas répéter les mêmes requêtes tant qu’une nouvelle piste documentaire n’est pas disponible.
- Suite distincte : passer à un autre candidat de la liste, en cherchant ses conditions finales ou un document contractuel primaire. PR #2 maintenue en brouillon ; aucune fusion ni mise en production.


## Audit anti-doublon — preuve contractuelle du taux variable Cairn CLO VII (20 octobre 2026)
- Contrôle anti-doublon : la liste des 13 candidats contient déjà XS1538267490 (Cairn CLO VII, Class D, valeur brute ESMA 342). Aucun nouveau candidat ni test générique ne sont ajoutés.
- Source primaire consultée : les Listing Particulars officiels publiés sur le site de l’Irish Stock Exchange identifient explicitement XS1538267490 comme Class D IM Removal and Replacement Non-Voting Notes, et définissent ces notes comme des Class D Notes. Le document donne EURIBOR comme référence, avec les périodes de 3 ou 6 mois selon la fréquence d’accrual / l’événement de changement de fréquence, et une marge applicable de 3,42 % par an (342 points de base). Sources : https://www.ise.ie/debt_documents/ListingParticulars_6e044ce7-6f09-42e7-95ed-b07012efd0b9.pdf ; corroboration de l’ISIN et de la désignation par la liste officielle Euronext Dublin : https://live.euronext.com/sites/default/files/statistics/dol/DOL2025-07-18.pdf.
- La valeur brute ESMA 342 concorde exactement avec la marge contractuelle de 3,42 %. La preuve primaire permet donc de préparer un override exact-ISIN sans réinterprétation heuristique. Le schéma existant attend toutefois un terme unique et le test de complétude impose actuellement NIBOR/3M à toutes les corrections : il faut généraliser ce test de manière ciblée avant d’ajouter l’override EURIBOR 3M/6M, sans casser la régression Jyske.
- Décision dans cette étape : aucun changement de données ni de parseur ; aucun run lancé. Le code et le test doivent être modifiés ensemble dans un commit atomique pour éviter un état intermédiaire invalide ou des validations en doublon.
- Prochaine action : ajouter l’override Cairn (EURIBOR, 3M/6M, 342 bps), adapter le test de complétude pour accepter les références/termes documentés, et ajouter une régression ciblée vérifiant l’ISIN exact, le spread, la source et l’absence de faux coupon fixe. PR #2 reste en brouillon ; aucune fusion ni mise en production.


## Audit anti-doublon — revue documentaire finale des corrections de coupons (20 octobre 2026)
- Audit préalable : PR #2 et HEAD vérifiés ; CI #220 et import/audit ESMA #33 sont déjà réussis sur le SHA 55d2aec08ed539f23b613cf8c5ec1972fe381d1a. Aucun run réussi n'est relancé par principe.
- Contrôle structurel des 12 overrides initiaux : aucune clé ISIN dupliquée ; les 12 entrées avaient taux, justification et URL HTTPS. Ce contrôle de forme n'était pas une preuve documentaire.
- Sources exactes vérifiées pour 10 corrections :
  - GR0118017657 — 3,375 % : notice officielle ATHEX, ISIN et taux exacts : https://www.athexgroup.gr/en/documents/10180/4959576/HELLENIC%20REPUBLIC%20-%20LISTING%20OF%20NEW%20BOND%2015%20-%2002%20-%202018/03f99d76-75e7-47c7-90ab-4b2fae7904d0
  - GR0118019679 — 1,875 % : notice officielle ATHEX identifiant l'ISIN et le taux : https://www.athexgroup.gr/documents/10180/5315048/HELLENIC%2BREPUBLIC%2B-%2BLISTING%2BOF%2BNEW%2BBOND%2B05%2B-%2B02%2B-%2B2019/4bf5c10e-4523-4093-98a7-2f9c615b0c9d?version=1.0
  - GR0114031561 — 3,450 % : notice officielle ATHEX identifiant l'ISIN et le taux : https://athens.euronext.com/en/more-options/announcements/securities-market-information-bulletin-05022019
  - GR0128010676, GR0128011682, GR0128012698, GR0128013704, GR0128014710 — 2,000 % chacun : calendrier officiel de la Public Debt Management Agency grecque, qui associe chaque ISIN à son coupon et à sa maturité : https://www.pdma.gr/en/general/issuance-calendar-syndication-and-auction-results
  - XS1722899918 — 1,125 % : fiche Fingrid correspondante, corroborée par les données de marché Börse Stuttgart/Onvista : https://www.boerse-stuttgart.de/en/products/bonds/stuttgart/a19snf-fingrid-oyj-eo-medium-term-notes-2017-27
  - XS3262577961 — 4,375 % : fiche Cbonds reliant explicitement l'ISIN à l'émission Development Bank of Japan et à son taux : https://cbonds.com/bonds/2049953/
- Deux corrections Netcity ne satisfont pas la règle de preuve stricte : XS3420465927 (5,468 %) et XS3420466065 (5,611 %). Les pages officielles de la Central Bank of Ireland confirment le titre d'émission et le taux, mais le texte public accessible ne montre pas l'ISIN exact. Les recherches ciblées supplémentaires n'ont pas trouvé de document final accessible reliant explicitement ces ISIN aux conditions. Un rapprochement par titre seul ne suffit pas à déclarer la correspondance certaine.
- Décision : retrait des deux overrides Netcity du registre de corrections vérifiées. Les valeurs brutes ESMA restent préservées et les coupons utilisables restent nuls avec le statut SUSPICIOUS_SOURCE_VALUE ; aucune valeur n'est devinée. Les deux références documentaires sont conservées pour une reprise ultérieure seulement si une preuve contractuelle qui expose l'ISIN exact devient disponible : https://www.centralbank.ie/regulation/industry-market-sectors/securities-markets/prospectus-regulation/prospectuses/netcity-telecom-s.a.----15-000-000-5.468-per-cent.-secured-amortising-bonds-due-june-2046---20-july-2026 et https://www.centralbank.ie/regulation/industry-market-sectors/securities-markets/prospectus-regulation/prospectuses/netcity-telecom-s.a.----45-000-000-5.611-per-cent.-secured-amortising-bonds-due-december-2052---20-july-2026.
- Amélioration de traçabilité : la source de GR0114031561 a été remplacée par la notice officielle ATHEX, plus directe que le lien de recherche Erste initial.
- Tests ajustés : la régression Netcity vérifie maintenant que ces deux valeurs suspectes ne sont pas appliquées comme coupons vérifiés et que les valeurs brutes sont conservées. Le contrôle général de complétude continue de s'appliquer aux 10 corrections restantes.
- Commits : mise à jour des données 6d4c1881c32c83007bf02ef85d721c3cd6e4ba18, test de régression 79136c0080e2601daa909f192c8f8ae7d684a275. Les workflows automatiques déclenchés par les fichiers de données/tests doivent être contrôlés sur le SHA pertinent ; les runs précédents ne valident pas ces modifications.
- Anti-doublon : aucune nouvelle batterie manuelle n'est lancée. Après vérification des workflows automatiques sur le code courant, reprendre l'audit de provenance du diff et des commits de la PR #2, qui reste ouverte en brouillon. Aucun merge ni déploiement.


## Audit anti-doublon — traçabilité des archives ESMA sources (20 octobre 2026)
- Audit préalable : PR #2 confirmée ouverte, en brouillon et non fusionnée ; HEAD vérifié avant action `8b517e641d4b3246c5413c0e3fada83207796a32`. Bond search CI #223 et ESMA FIRDS bulk bond import #36 sont SUCCESS sur le HEAD contrôlé ; aucun de ces workflows n'est relancé manuellement.
- Réutilisation des contrôles existants : le manifeste catalogue donne déjà la publication ESMA `20261017`, le type `FULINS_D`, le nombre d'enregistrements et les empreintes SHA-256 des shards. Les tests vérifient déjà l'absence de doublons ISIN et l'exactitude des index.
- Manque distinct constaté : le manifeste ne conserve pas les URL, noms, tailles et SHA-256 des archives ZIP ESMA individuelles utilisées pour produire les enregistrements. La date de publication seule ne permet pas de retrouver sans ambiguïté les octets exacts téléchargés.
- Modification ciblée : le générateur calcule maintenant, pour chaque archive sélectionnée, son nom, URL source, taille en octets et SHA-256 ; le séparateur propage ces métadonnées vers `manifest.json`. Ajout de tests ciblés pour l'empreinte calculée et sa conservation dans le manifeste. Aucun taux/coupon, ISIN ou autre donnée obligataire n'est modifié.
- Limite explicite : le manifeste actuellement commité provient d'une génération antérieure et ne peut pas être complété rétroactivement sans re-télécharger les archives exactes de la publication. Le champ de provenance par archive sera renseigné lors de la prochaine génération réussie ; ne pas prétendre que les empreintes historiques sont déjà présentes.
- Validation attendue : les workflows automatiques déclenchés par ce commit devront être lus sur le SHA de code/tests correspondant. Les succès #223 et #36 valident le HEAD précédent uniquement. Aucun workflow manuel n'est lancé ; aucun merge ni déploiement.
- Audit de portée toujours ouvert : 586 commits et 187 fichiers, dont les shards/index générés. Cette amélioration ferme un manque de traçabilité de la source ; elle ne remplace pas la revue complète de provenance des commits et des données.
