# H0D Machine Health Manager v0.1.0

Console MJ de combat pour Foundry VTT v14 + Custom System Builder.

- Sélectionner exactement un token machine.
- Lancer la macro `H0D — État machine`.
- Corps : -10/-5/-1, saisie directe, +1, MAX.
- Pièces : -5/-1, saisie directe, +1, MAX, état, marquage.
- 0 PV passe automatiquement la pièce à `Detruit`.
- Les états utilisent les clés canoniques du template Pièce Machine v2.4 : `Intact`, `Endommage`, `Detruit`, `Detache`.
- Les PV des pièces modifient directement `H0D_Composant_PV_Actuels`.
- Le template Machine actuel n'a pas de champ « PV corps actuels » distinct : le module conserve donc les PV actuels du corps dans un flag dédié, initialisé depuis `H0D_Machine_PV_Corps_Base`, afin de ne pas mélanger corps et somme corps+pièces.

Macro : `game.h0dMachineHealth.open();`

Repo : https://github.com/freeberserk/h0d-machine-health-manager
Manifest : https://github.com/freeberserk/h0d-machine-health-manager/releases/latest/download/module.json
