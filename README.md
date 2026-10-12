# H0D Machine Health Manager v0.3.3

Console MJ Foundry VTT v14 pour la mécanique d’Intégrité des machines H0D.

## Règles automatisées
- **Intégrité** = vraie jauge de survie.
- **Corps protégé** : dégâts directs divisés par 2, arrondis à l’inférieur.
- **Corps exposé** : dégâts directs normaux.
- Une pièce ciblée absorbe les dégâts jusqu’à 0 PV.
- Si elle est détruite avec de l’overkill : 50 % de l’excédent, arrondi à l’inférieur, est reporté sur **une seule** pièce active de la même zone anatomique.
- Le report ne rebondit jamais une seconde fois.
- S’il n’existe aucune pièce adjacente valide, le report est perdu.
- Si la pièce adjacente n’absorbe pas tout le report, le surplus est perdu.
- Les dégâts réellement absorbés par les pièces comptant dans l’Intégrité réduisent la jauge globale.

## Interface
Sélectionner exactement un token Machine puis lancer la macro `H0D — État machine`.

Boutons `−5`, `−1` et `DGT` appliquent de vrais dégâts et utilisent automatiquement l’overkill. `PV`, `+1`, `MAX` restent des outils MJ de correction/réparation.

Le module reste tolérant avec les anciennes machines : si `Zone anatomique` / `Protège le corps` manquent encore, il les déduit temporairement du nom, de l’emplacement, du type et du bonus de DEF.

- Une pièce déjà détruite/détachée ne peut pas servir de point de départ à un report ; ses boutons de dégâts sont désactivés.


## Intégrité v2 — règle figée

- Corps protégé : dégâts directs / 2, arrondi inférieur.
- Corps exposé : dégâts directs normaux.
- Une pièce absorbe au maximum ses PV restants.
- 50 % de l'overkill, arrondi inférieur, est reporté sur UNE pièce active de la même zone.
- Aucun second rebond.
- Sans pièce adjacente valide, le report est perdu.
- Seuls les dégâts réellement absorbés par des pièces qui comptent dans l'Intégrité diminuent cette jauge.
- Les modifications directes des PV/états depuis la fiche de pièce synchronisent aussi l'Intégrité.


## Correctif 0.2.2

La 0.2.1 contenait une régression de build : les fonctions `applyBodyDamage` et
`applyPieceDamage` étaient référencées dans l'API publiée au `ready`, mais absentes
du script final. Foundry marquait le module actif, mais l'API ne pouvait jamais être publiée.

La 0.2.2 restaure ces fonctions sans modifier les règles Intégrité v2.


## Interface Combat — v0.3.0

La fenêtre principale est désormais conçue pour le combat :
1. cliquer sur **Corps** ou sur une **pièce** ;
2. saisir les dégâts ;
3. cliquer **APPLIQUER** (ou appuyer sur Entrée).

Le module calcule automatiquement la réduction du corps, la destruction de pièce, l'overkill,
la pièce adjacente de même zone, la perte du report et l'Intégrité.

Le bouton **Marquer / Démarquer** reste visible sur chaque pièce. Les outils moins fréquents
(PV manuels, réparation, état) sont rangés derrière `…` afin de garder l'interface lisible.


## v0.3.2 — PV et état restent cohérents

Le Health Manager est l'autorité de la phase **PV → état** de la chaîne des pièces.

- une pièce à son maximum est **Intacte** ;
- entre 1 et max−1 PV, elle est **Endommagée** ;
- une pièce détachable amenée à 0 PV est **Détachée**, sauf destruction critique pendant un coup ;
- une pièce non détachable à 0 PV est **Détruite** ;
- une pièce explicitement détachée peut conserver des PV > 0.

Les corrections faites directement depuis la fiche CSB sont désormais normalisées selon les mêmes règles, puis l'Intégrité est recalculée une seule fois.


## v0.3.3 — Ouverture de la console

Foundry v14 peut parfois donner automatiquement le focus au champ **Dégâts** après le rendu d'un DialogV2, ce qui fait défiler la fenêtre et masque le haut de la carte d'Intégrité.

La console recadre désormais automatiquement son contenu en haut à l'ouverture afin de garder visibles :
- le portrait et le nom de la machine ;
- **CORPS PROTÉGÉ / EXPOSÉ** ;
- **INTÉGRITÉ actuel / max** ;
- la barre d'Intégrité.

Aucune règle de combat n'est modifiée.
