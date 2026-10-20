# Phase obligations — registre d'acceptation et mesure d'avancement

Date de référence : 20 octobre 2026  
HEAD de référence : `293cca158949d486c6450e681375b20507b4b38e`  
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
| 4 | Batterie CI de recherche verte sur le HEAD de référence | OPEN | Bond search CI #39465778220 est CANCELLED sur le SHA de référence; ne pas compter comme succès |
| 5 | Une fiche obligataire ne s'affiche que si tous les champs essentiels requis sont exploitables; sinon elle est exclue des résultats | OPEN | Le code masque les coupons suspects et les échéances sentinelles, mais peut encore afficher une fiche avec d'autres champs essentiels absents |
| 6 | Tous les overrides de coupon fixe présents dans le registre sont retrouvés et confirmés dans l'audit du catalogue | OPEN | Le rapport indique 9 overrides fixes vérifiés alors que le registre comporte 10 entrées; réconcilier cet écart ISIN par ISIN |
| 7 | Chaque coupon suspect est sourcé ou mis en quarantaine et exclu des fiches éligibles | OPEN | 43 valeurs suspectes détectées, 34 encore non résolues; le comportement d'exclusion au niveau de la fiche entière n'est pas garanti |
| 8 | Chaque coupon absent est classé (taux variable, valeur non applicable, donnée inconnue) et les fiches non conformes sont exclues | OPEN | 38 731 coupons absents tous groupes CFI confondus; 9 051 dans DA, 7 566 dans DB, et les autres groupes détaillés dans le rapport. Absence de coupon ne signifie pas toujours erreur, donc classification requise |
| 9 | Les corrections de taux variables sont documentées par ISIN exact et ont des tests de non-confusion marge/coupon | DONE | Jyske `NO0012654534`, Cairn `XS1538267490`, Alhambra `XS2074549820` : sources et régressions présentes; le workflow catalogue du SHA de référence a réussi |
| 10 | Les échéances sentinelles sont qualifiées et exclues des fiches éligibles; les perpétuelles sont distinguées des données invalides | OPEN | 4 276 dates sentinelles; 2 489 noms suggèrent une perpétuité, 1 787 restent à qualifier. Le champ est masqué par l'interface mais le classement exhaustif n'est pas terminé |
| 11 | Tous les fichiers modifiés dans la PR sont inventoriés et classés par rôle | DONE | Inventaire actuel de 187 fichiers; les shards/index générés sont distingués des workflows, scripts, tests, fonction et interface. C'est une revue de portée, pas une revue ligne par ligne |
| 12 | Chaîne de commits et provenance des données générées réconciliées jusqu'à la source, sans éléments non expliqués | OPEN | Audit complet de provenance des commits et vérification indépendante exhaustive des données générées non terminés |

## Score mesuré

- Critères DONE : 5 / 12.
- **Score de critères fermés : 41,7 %**.
- Critères OPEN : 7 / 12.
- Le score de 41,7 % est un décompte strict des critères ci-dessus; ce n'est ni le pourcentage d'obligations présentes, ni une estimation du temps ou de l'effort restant.

## Couverture du catalogue — indicateurs distincts

Rapports d'audit produits par les workflows Build ESMA #39465765263 et ESMA FIRDS bulk import #39465777991, tous deux SUCCESS sur le HEAD de référence, publication ESMA 20261017 :

- 631 239 enregistrements; 631 239 ISIN uniques et valides.
- Coupon présent : 592 508 / 631 239 = 93,86 %.
- Échéance présente : 626 963 / 631 239 = 99,32 %.
- Obligations classiques CFI DB : 81 526; coupon exploitable 90,72 %; échéance exploitable 97,16 %; les deux simultanément exploitables 72 002 / 81 526 = 88,32 %.
- 43 valeurs de coupon suspectes; 34 non résolues selon l'audit fixe du coupon.
- 4 276 échéances sentinelles, dont la qualification reste à terminer.

Ces ratios mesurent la présence/exploitabilité des champs, pas la vérification contractuelle de chaque instrument. Les taux variables sont suivis séparément du champ coupon fixe.

## Anti-doublon et règle de mise à jour

- Cette grille remplace tout pourcentage global non documenté.
- Avant chaque nouvelle tâche, relire cette grille, les fichiers/tests pertinents et les runs existants; ne pas répéter un contrôle vert sans changement pertinent.
- Après chaque changement, ajouter la preuve, mettre à jour l'état d'un critère et recalculer le score uniquement si un critère entier est fermé.
- Un run annulé, en attente ou échoué ne vaut jamais DONE.
- PR #2 reste ouverte en brouillon; aucun merge ni déploiement sans instruction explicite.
