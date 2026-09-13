# Spécification du menu Workspace

Ce document décrit le comportement attendu et l'implémentation actuelle du
menu latéral **Workspace / Mes schémas**. Il sert de référence commune pour
les évolutions humaines et les agents.

Les flux décisionnels sont illustrés dans trois diagrammes PlantUML :

- [`plantUML-create-schema.puml`](./plantUML-create-schema.puml) ;
- [`plantUML-modify-schema.puml`](./plantUML-modify-schema.puml) ;
- [`plantUML-force-render.puml`](./plantUML-force-render.puml).

## 1. Objectif

Le menu gauche permet de gérer plusieurs documents PlantUML ou Structurizr
DSL dans le navigateur :

- afficher les documents disponibles ;
- sélectionner le document actif ;
- créer un nouveau document ;
- supprimer un document ;
- supprimer le cache SVG de la session ;
- ouvrir un document via une URL locale courte ;
- conserver les sources dans `localStorage` et les rendus SVG dans
  `sessionStorage`.

Le menu est conçu pour une utilisation sur écran d'ordinateur. Il n'a pas
d'objectif responsive mobile.

## 2. Structure visuelle

Le composant est rendu dans `src/index.ts`, dans `.schema-sidebar`.

```text
Workspace
Mes schémas                         [+] [réduire]
┌──────────────────────────────────────────────┐
│ Nom du schéma                         [↗] [🗑] │
│ Langage · ID <UUID>                           │
│ Modifié <date et heure>                       │
│ Rendu <date et heure | jamais>                │
└──────────────────────────────────────────────┘
```

Chaque schéma est représenté par `.schema-item`.

### 2.1 En-tête

- `Workspace` : libellé de section.
- `Mes schémas` : titre du menu.
- `+` (`#add-schema-button`) : crée un nouveau schéma.
- `‹` / `›` (`#collapse-workspace-button`) : réduit ou déploie la zone
  Workspace.

### 2.2 Entrée de schéma

Chaque entrée contient :

1. **Nom** : valeur de `schema.name`.
2. **Détails** : langage et identifiant stable :
   `PlantUML · ID <UUID>` ou `Structurizr · ID <UUID>`.
3. **Dernière modification** :
   `Modifié <date courte> <heure courte>`.
4. **Dernier rendu** :
   `Rendu <date courte> <heure courte>` ou `Rendu jamais`.
5. **Lien externe** (`↗`) : ouvre une nouvelle fenêtre avec l'URL courte du
   schéma.
6. **Suppression** (`🗑`) : demande confirmation avant suppression.

Les informations de modification et de rendu sont affichées sur deux lignes
distinctes pour éviter la troncature.

## 3. Modèle de données persistant

Les documents sont enregistrés sous la clé `schema-ide-documents`.
L'identifiant du document actif est enregistré sous
`schema-ide-current`.

```ts
type SchemaDocument = {
  id: string;
  name: string;
  encoded: string;
  hash: string;
  modifiedAt: string;
  renderedAt?: string;
  language: "plantuml" | "structurizr";
};
```

Les sources, métadonnées et identifiants sont persistés dans `localStorage`.
Les SVG sont volontairement conservés dans une structure distincte de
`sessionStorage` :

```ts
type SvgCache = Record<string, string>;
```

La clé `schema-ide-svg-cache` contient cette structure et chaque entrée est
indexée par le hash du schéma.

### 3.1 Identifiant `id`

- Créé une seule fois avec `crypto.randomUUID()`.
- Ne change pas lorsque la source, le nom ou le rendu change.
- Sert à sélectionner le document et à conserver sa position logique.

### 3.2 Source `encoded`

- Contient la source compressée avec `plantuml-encoder`.
- La source affichée dans Monaco est obtenue avec `decode(encoded)`.
- Ce champ reste local et n'est pas placé dans l'URL courte.

### 3.3 Hash `hash`

- Hash FNV-1a 64 bits représenté par 16 caractères hexadécimaux.
- Calculé sur `encoded`.
- Recalculé lorsque le contenu source change.
- Sert à identifier la version de contenu et à générer l'URL courte.

### 3.4 Cache SVG de session

- Le cache est séparé de `SchemaDocument`.
- Le SVG est stocké dans `sessionStorage` sous `schema-ide-svg-cache`.
- Le hash du schéma est la clé d'accès au SVG.
- Le cache est supprimé automatiquement par le navigateur à la fermeture de
  l'onglet ou de la session de navigation.
- Il est supprimé dès que la source correspondante change.
- Il peut être restauré sans appeler le moteur PlantUML.
- Le bouton de l'en-tête Workspace supprime tout le cache SVG de la session.

### 3.5 Dates

- `modifiedAt` : dernière modification effective de la source.
- `renderedAt` : dernier rendu PlantUML réussi. Une restauration passive du
  cache ne modifie pas cette date ; un rendu volontaire la met à jour.
- La sélection d'un document ne modifie aucune date par elle-même.
- La restauration depuis le cache ne modifie ni `renderedAt` ni `modifiedAt`.
- Un rendu volontaire met à jour `renderedAt`, même si le SVG précédent est
  déjà présent dans le cache.
- Après disparition du cache à la fermeture du navigateur, le premier affichage
  d'un schéma déclenche un nouveau rendu. Les autres schémas sont rendus lors
  de leur sélection.

## 4. Règles d'ordre et d'affichage

- `schemas` est affiché dans son ordre de stockage.
- Aucun tri par date, nom ou hash n'est effectué lors du rendu de la liste.
- Sélectionner un schéma ne déplace donc jamais les autres entrées.
- La classe `.active` est appliquée uniquement à l'entrée dont `id` est égal à
  `currentSchemaId`.
- Le nom est tronqué visuellement si nécessaire.
- Les dates sont formatées avec `Intl.DateTimeFormat("fr-FR")`.

## 5. Sélection d'un schéma

Lorsqu'une entrée est sélectionnée :

1. La source actuellement ouverte est sauvegardée dans le document actif si
   elle a changé.
2. `currentSchemaId` prend la valeur du nouvel `id`.
3. La source et le langage du document choisi sont chargés dans Monaco.
4. Le rendu différé précédent est annulé.
5. Le preview est rendu avec la source du document choisi.
6. Le document choisi devient visuellement actif.
7. Les données sont persistées dans `localStorage`.

Si le cache de session contient un SVG correspondant à son `hash`, le preview
est restauré depuis le cache et le moteur PlantUML n'est pas appelé.

## 6. Création d'un schéma

Le bouton `+` :

1. crée un nouvel `id` UUID ;
2. initialise le nom avec `Schéma <n>`;
3. initialise la source avec le diagramme par défaut ;
4. calcule `encoded` et `hash` ;
5. initialise `modifiedAt` ;
6. ajoute le document à la fin de `schemas` ;
7. sélectionne le nouveau document ;
8. déclenche son rendu ;
9. persiste l'ensemble.

Le nouveau document est ajouté à la fin et ne réordonne pas les documents
existants.

## 7. Suppression d'un schéma

La suppression :

- demande une confirmation utilisateur ;
- retire le document ciblé de `schemas` ;
- crée un document par défaut si la liste devient vide ;
- si le document actif est supprimé, sélectionne le document voisin à la même
  position lorsque c'est possible ;
- recharge sa source et son rendu ;
- persiste la nouvelle liste.

La suppression d'un schéma ne doit pas modifier l'ordre relatif des documents
restants.

## 8. Rendu et cache

### 8.1 Modification de la source

Lorsqu'une source change :

1. Monaco déclenche un rendu différé ;
2. le hash de la nouvelle source est calculé ;
3. si le hash diffère, l'entrée SVG du hash précédent est supprimée du cache
   de session ;
4. `modifiedAt` est mis à jour ;
5. `renderedAt` est supprimé jusqu'à un rendu réussi ;
6. le rendu est lancé après le délai prévu.

### 8.2 Rendu effectif

Après un rendu PlantUML réussi :

- le SVG est converti en texte et placé dans le cache de session sous `hash` ;
- `renderedAt` est mis à jour ;
- la liste Workspace est rafraîchie ;
- les documents sont persistés ;
- l'URL courante est remplacée par l'URL basée sur le hash.

### 8.3 Rendu restauré lors de l'affichage

Si `schema.hash` correspond au contenu affiché et qu'un SVG existe dans le
cache de session pour ce hash :

- le SVG est restauré depuis `sessionStorage` avec `hash` ;
- le moteur PlantUML n'est pas appelé ;
- le statut du preview devient `Rendu restauré` ;
- `renderedAt` reste inchangé car il s'agit seulement d'un affichage ou d'une
  sélection de schéma ;
- `modifiedAt` reste inchangé.

### 8.4 Rendu volontaire

Le bouton de rendu, `Ctrl/Cmd + Enter` et une modification de la source
forcent un appel au moteur PlantUML, même si le cache contient déjà un SVG
pour le hash courant. Après succès, le SVG est remplacé dans le cache et
`renderedAt` est mis à jour.

## 9. URLs courtes

Le format courant est :

```text
<origin><pathname>#<hash-16-hex>
```

Exemple :

```text
http://localhost:5173/#a1b2c3d4e5f60718
```

### 9.1 Résolution d'une URL

Au chargement :

1. le fragment après `#` est lu ;
2. il est recherché d'abord parmi les `schema.hash` locaux ;
3. le document correspondant devient actif ;
4. si le fragment est une ancienne source PlantUML encodée et décodable, il
   est importé comme nouveau document pour compatibilité ;
5. si aucun document ne correspond, le stockage local existant est utilisé.

### 9.2 Limite importante

Un hash seul ne contient pas la source. Une URL courte ne peut donc être
ouverte correctement que dans un navigateur qui possède déjà le document dans
son `localStorage`. Le partage inter-navigateurs nécessite encore un mécanisme
externe de stockage ou le retour à une URL contenant la source encodée.

## 10. Compatibilité et migration

Le chargement accepte encore les anciens formats :

- `savedAt` est utilisé comme valeur de repli pour `modifiedAt` ;
- les anciens documents sans `hash` recalculent leur hash ;
- les anciens documents avec `source` sont convertis en `encoded` ;
- `renderedAt` est optionnel ;
- les anciens fragments URL contenant la source encodée restent décodables.

Toute évolution du modèle doit conserver cette stratégie de migration ou
prévoir une migration explicite avant de supprimer un ancien champ.

## 11. Contrats de non-régression

Les tests Playwright doivent garantir au minimum que :

- la liste conserve son ordre après sélection ;
- la sélection affiche la source du bon document ;
- l'URL générée contient un hash court de 16 caractères hexadécimaux ;
- un SVG en cache évite un nouvel appel au moteur ;
- une restauration passive ne modifie pas `renderedAt` ;
- un rendu volontaire met à jour `renderedAt` ;
- les lignes `Modifié` et `Rendu` sont visibles séparément ;
- la persistance locale contient `id`, `hash`, `modifiedAt` et `renderedAt`
  après un rendu réussi ;
- le cache de session contient le SVG sous la clé du hash ;
- le bouton de suppression vide le cache de session et le rendu suivant
  rappelle le moteur PlantUML.
