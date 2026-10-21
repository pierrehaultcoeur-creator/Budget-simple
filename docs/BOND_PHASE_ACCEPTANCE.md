# Phase obligations — registre d'acceptation et mesure d'avancement

Date de référence : 21 octobre 2026  
HEAD de référence : `85fbc5436081a282e82e155febc1580c14a3f52f`  
PR #2 : ouverte en brouillon, non fusionnée.

## Méthode de calcul

Le pourcentage ci-dessous est un **score de critères d'acceptation fermés**, pas une estimation du temps passé ni du volume de code. Chaque critère est binaire et vaut un point. Un critère n'est fermé que si une preuve existe. Les états PARTIAL, OPEN ou BLOCKED ne rapportent aucun point. Le dénominateur reste fixe à 12 critères tant que le périmètre n'est pas modifié explicitement.

- DONE = 1 point, preuve vérifiée.
- PARTIAL / OPEN / BLOCKED = 0 point.
- Score = critères DONE / 12.

Cette méthode est volontairement stricte. Les métriques de couverture des données sont présentées séparément et ne sont jamais assimilées au pourcentage d'avancement global.

## Tableau de référence

| # | Critère d'acceptation | État au 20/10/2026 | Preuve / manque restant |
|---|---|---|---|
| 1 | Catalogue structurellement intègre : ISIN uniques et checksum valides, CFI bien formés | DONE | Rapport d'audit du catalogue : 631 239 enregistrements, 0 doublon, 0 checksum invalide, 0 CFI mal formé |
| 2 | Manifeste conserve pour chaque archive ESMA l'URL, la taille et le SHA-256 | DONE | Manifeste publication 20261017 : 4 archives décrites avec URL, octets et SHA-256. La comparaison indépendante avec les ZIP sources reste un contrôle distinct |
| 3 | Recherche, endpoint et index existent et ont passé leurs tests sur le code de recherche inchangé | DONE | Les index ISIN/noms, `netlify/functions/bond-search.js` et l'interface existent; les runs de recherche précédents sont verts et aucun code de recherche/UI n'a changé dans le commit de référence |
| 4 | Batterie CI de recherche verte sur le HEAD de référence | DONE | Bond search CI #39474736280 SUCCESS sur le HEAD `3f756a2a2c00d920c80349e1486849b8a913e00c`; tests catalogue/index, régressions de recherche et syntaxe JavaScript réussis |
| 5 | Une fiche obligataire ne s'affiche que si tous les champs essentiels requis sont exploitables; sinon elle est exclue des résultats | DONE | `investissement.html` applique `isDisplayEligible` avant le rendu; les régressions couvrent les fiches complètes/incomplètes et l'exclusion de la fiche ESMA incomplète. Bond search CI #39474736280 SUCCESS sur le HEAD de référence |
| 6 | Tous les overrides de coupon fixe présents dans le registre sont retrouvés et confirmés dans l'audit du catalogue | DONE | ESMA bulk import #39477842942 SUCCESS sur le HEAD courant; rapport artefact : registre 10, correspondances exactes 10, absentes 0, divergences 0. Test dédié de couverture du registre ajouté et CI #39477842905 SUCCESS |
| 7 | Chaque coupon suspect est sourcé ou mis en quarantaine et exclu des fiches éligibles | OPEN | 43 valeurs suspectes détectées, 34 encore non résolues; le comportement d'exclusion au niveau de la fiche entière n'est pas garanti |
| 8 | Chaque coupon absent est classé (taux variable, valeur non applicable, donnée inconnue) et les fiches non conformes sont exclues | OPEN | 38 731 coupons absents tous groupes CFI confondus; 9 051 dans DA, 7 566 dans DB, et les autres groupes détaillés dans le rapport. Absence de coupon ne signifie pas toujours erreur, donc classification requise |
| 9 | Les corrections de taux variables sont documentées par ISIN exact et ont des tests de non-confusion marge/coupon | DONE | Jyske `NO0012654534`, Cairn `XS1538267490`, Alhambra `XS2074549820` : sources et régressions présentes; le workflow catalogue du SHA de référence a réussi |
| 10 | Les échéances sentinelles sont qualifiées et exclues des fiches éligibles; les perpétuelles sont distinguées des données invalides | OPEN | 4 276 dates sentinelles; 2 489 noms suggèrent une perpétuité, 1 787 restent à qualifier. Le champ est masqué par l'interface mais le classement exhaustif n'est pas terminé |
| 11 | Tous les fichiers modifiés dans la PR sont inventoriés et classés par rôle | DONE | Inventaire actuel de 187 fichiers; les shards/index générés sont distingués des workflows, scripts, tests, fonction et interface. C'est une revue de portée, pas une revue ligne par ligne |
| 12 | Chaîne de commits et provenance des données générées réconciliées jusqu'à la source, sans éléments non expliqués | OPEN | Audit complet de provenance des commits et vérification indépendante exhaustive des données générées non terminés |

## Score mesuré

- Critères DONE : 8 / 12.
- **Score de critères fermés : 66,7 %**.
- Critères OPEN : 4 / 12.
- Le score de 41,7 % est un décompte strict des critères ci-dessus; ce n'est ni le pourcentage d'obligations présentes, ni une estimation du temps ou de l'effort restant.

## Couverture du catalogue — indicateurs distincts

Rapports d'audit de la publication ESMA 20261017. Validation courante : ESMA FIRDS bulk bond import #39477842942 SUCCESS sur le HEAD `85fbc5436081a282e82e155febc1580c14a3f52f` :

- 631 239 enregistrements; 631 239 ISIN uniques et valides.
- Coupon présent : 592 508 / 631 239 = 93,86 %.
- Échéance présente : 626 963 / 631 239 = 99,32 %.
- Obligations classiques CFI DB : 81 526; coupon exploitable 90,72 %; échéance exploitable 97,16 %; les deux simultanément exploitables 72 002 / 81 526 = 88,32 %.
- 10 overrides de coupon fixe sur 10 réconciliés ISIN par ISIN (0 absent, 0 divergence); 43 valeurs de coupon suspectes, dont 34 non résolues.
- 4 276 échéances sentinelles, dont la qualification reste à terminer.

Ces ratios mesurent la présence/exploitabilité des champs, pas la vérification contractuelle de chaque instrument. Les taux variables sont suivis séparément du champ coupon fixe.

## Anti-doublon et règle de mise à jour

- Cette grille remplace tout pourcentage global non documenté.
- Avant chaque nouvelle tâche, relire cette grille, les fichiers/tests pertinents et les runs existants; ne pas répéter un contrôle vert sans changement pertinent.
- Après chaque changement, ajouter la preuve, mettre à jour l'état d'un critère et recalculer le score uniquement si un critère entier est fermé.
- Un run annulé, en attente ou échoué ne vaut jamais DONE.
- PR #2 reste ouverte en brouillon; aucun merge ni déploiement sans instruction explicite.


## Mesure actualisée — 20 octobre 2026, après CI #242 et ESMA #55
- HEAD de code contrôlé : `3f756a2a2c00d920c80349e1486849b8a913e00c`.
- Bond search CI #242 (`39474736280`) : SUCCESS sur ce SHA. Tests offline, intégrité de l'index des noms, tests de régression de recherche et syntaxe JavaScript réussis.
- ESMA FIRDS bulk bond import #55 (`39474736336`) : SUCCESS sur le même SHA. Tests hors ligne, génération isolée de l'aperçu et audit, puis dépôt de l'artefact réussis.
- Bond search CI #241 (`39474687062`) : CANCELLED avant les étapes de vérification d'index et de recherche; remplacé par #242 sur le HEAD plus récent, il n'est pas compté comme test échoué.
- Critères fermés : 8/12 = 66,7 %. Les critères 4, 5 et 6 sont désormais DONE sur la base des workflows verts et des régressions du filtre des fiches complètes. Le score ne signifie ni que 58,3 % des obligations sont vérifiées, ni que 58,3 % du temps est écoulé.
- Restent ouverts : coupons suspects non résolus (7), classification des coupons absents (8), qualification exhaustive des échéances sentinelles (10) et provenance complète de la PR (12).
- Anti-doublon : aucun test relancé manuellement; résultats des runs existants réutilisés. PR #2 reste ouverte en brouillon, non fusionnée et non déployée.


## Mesure actualisée — 21 octobre 2026, réconciliation des overrides de coupon
- HEAD de code contrôlé : `85fbc5436081a282e82e155febc1580c14a3f52f`.
- [Bond search CI #39477842905](https://github.com/pierrehaultcoeur-creator/Budget-simple/actions/runs/39477842905) : SUCCESS sur le HEAD courant; tests catalogue/index, complétude de l'index des noms, régressions de recherche et syntaxe JavaScript réussis.
- [ESMA FIRDS bulk bond import #39477842942](https://github.com/pierrehaultcoeur-creator/Budget-simple/actions/runs/39477842942) : SUCCESS sur le même SHA; tests hors ligne et audit isolé du catalogue publiés en artefact.
- Le rapport d'audit de l'artefact donne `verifiedCouponOverrideCount=10` et `couponOverrideCoverage.registryCount=10, matchedCount=10, missingCount=0, mismatchCount=0`. Les 10 ISIN du registre correspondent au statut `VERIFIED_OVERRIDE`, à la valeur corrigée et à la source attendues.
- Cause de l'ancien écart : le rapport ne comptait les overrides vérifiés que dans la branche de coupons suspects. Il omettait donc les overrides appliqués dont la valeur brute ne tombait pas dans cette catégorie. Le comptage est maintenant indépendant de la suspicion de la valeur brute; les valeurs suspectes non résolues restent comptées séparément.
- Régressions ajoutées : couverture du registre (ISIN absent ou divergence), et comptage d'un override appliqué à une valeur brute qui n'est pas suspecte.
- Critère 6 fermé; score recalculé à 8/12 = 66,7 %, contre 7/12 = 58,3 % à la mesure précédente. Restent ouverts : coupons suspects (7), coupons absents (8), échéances sentinelles (10) et provenance complète de la PR (12).
- Anti-doublon : réutilisation du rapport artefact et des tests CI du SHA courant; aucun re-run manuel, aucune modification du catalogue source dans cette tâche documentaire. PR #2 reste ouverte en brouillon, non fusionnée et non déployée.
