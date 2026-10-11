## 0.3.1 — Seuil critique de destruction
- Lorsqu'un coup met une pièce détachable à 0 PV, dégâts du coup >= 200 % de ses PV max : Detruit ; sinon Detache.
- L'issue est conservée sur l'Item ; la neutralisation fonctionnelle reste immédiate à 0 PV.
- L'overkill sur la seule pièce adjacente conserve la règle 50 %, sans cascade ; son propre seuil critique est évalué sur les dégâts reportés.
- Une correction manuelle des PV à 0 conserve un état Detache pour une pièce détachable, sans simuler un coup critique.

# Changelog

## 0.3.0
- Refonte ergonomique complète de la console, sans changement de mécanique.
- Interface Combat par défaut : sélectionner une cible, saisir les dégâts, cliquer **APPLIQUER**.
- En-tête visuel avec Intégrité, barre globale et état **CORPS PROTÉGÉ / EXPOSÉ**.
- Composants en cartes compactes sur deux colonnes, avec PV, état, zone et protection.
- Le bouton **Marquer / Démarquer** reste directement accessible comme demandé.
- Les fonctions de maintenance (PV, +1, MAX, État) passent derrière le bouton `…` de chaque pièce.
- Les réglages manuels d'Intégrité passent derrière **Maintenance**.
- La dernière valeur de dégâts et la cible choisie sont conservées pendant l'utilisation de la fenêtre.
- Entrée dans le champ Dégâts = appliquer immédiatement l'attaque.
- Mécanique Intégrité v2 inchangée : corps protégé ÷2 ; overkill 50 % ; une seule pièce adjacente ; aucune cascade ; report perdu sans cible valide.


## 0.2.2
- Correctif critique de démarrage de la 0.2.1.
- Restaure `applyBodyDamage()` et `applyPieceDamage()`, référencées par l'API mais absentes du fichier chargé.
- Le module peut de nouveau publier `game.h0dMachineHealth` et son `module.api`.
- Ajoute un contrôle d'intégrité de l'API au démarrage pour rendre une régression similaire immédiatement visible.
- Mécanique inchangée : corps protégé ÷2 ; overkill 50 % ; une seule pièce adjacente ; aucune cascade ; report perdu sans cible valide.


## 0.2.1
- Recalé sur H0D Template Manager **1.3.0** / Machine v3.12 / Pièce v2.6.
- Synchronisation automatique de l'Intégrité lorsqu'un MJ modifie directement les PV/état d'une pièce depuis la fiche CSB.
- Les mises à jour internes du Health Manager sont protégées contre le double comptage.
- Contribution à l'Intégrité basée sur PV courants + état actif de la pièce.
- Compatibilité legacy renforcée pour `Compte dans l'Intégrité`, Zone et Protection du corps.
- Overkill inchangé : 50 % arrondi inférieur, une seule pièce de la même zone, aucune cascade ; sans cible valide, report perdu.
- Le résumé indique également la part de report perdue si la pièce adjacente n'a pas assez de PV.


## 0.2.0
- Nouveau système d’Intégrité globale.
- Corps protégé : dégâts directs /2, arrondi inférieur.
- Corps exposé : dégâts directs normaux.
- Overkill : 50 % vers une seule pièce active de la même zone.
- Aucun rebond en chaîne ; absence de cible adjacente = dégâts perdus.
- Mise à jour automatique de `H0D_Machine_PV_Actuels`, donc de la barre du token.
- Zones et protections affichées dans la console.
- Fallback heuristique pour les anciennes pièces non migrées.

