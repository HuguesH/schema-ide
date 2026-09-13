# Schema IDE

Éditeur web PlantUML écrit en TypeScript, compatible avec Vite et basé sur
[`plantuml/plantuml.js`](https://github.com/plantuml/plantuml.js).

Le rendu des diagrammes est exécuté localement dans le navigateur grâce à
PlantUML.js et CheerpJ. Le projet ne dépend pas d'un serveur PlantUML distant.

## Prérequis

- Node.js récent ;
- npm ;
- un navigateur moderne compatible avec les modules JavaScript et WebAssembly.

## Installation

Depuis la racine du projet :

```bash
npm install
```

Cette commande installe notamment la dépendance `@sakirtemel/plantuml.js`.

## Commandes npm

### Démarrer le serveur de développement

```bash
npm run dev
```

Vite démarre l'application en mode développement, généralement à l'adresse :

<http://localhost:5173>

Pour rendre l'application accessible sur le réseau local :

```bash
npm run dev -- --host 0.0.0.0
```

### Vérifier et construire l'application

```bash
npm run build
```

Cette commande :

1. vérifie le typage TypeScript ;
2. construit les fichiers optimisés avec Vite ;
3. copie les fichiers runtime de PlantUML.js dans `dist/plantuml-wasm`.

### Prévisualiser le build de production

Après `npm run build` :

```bash
npm start
```

Cette commande démarre le serveur de prévisualisation Vite sur le build présent
dans `dist/`.

## Cycle de développement recommandé

```bash
npm install
npm run dev
```

Avant de livrer une modification importante :

```bash
npm run build
npm start
```

## Fonctionnalités principales

- édition de code PlantUML avec Monaco Editor et coloration syntaxique ;
- complétion PlantUML et Structurizr DSL (mots-clés, snippets et identifiants déclarés) ;
- numéros de ligne et défilement gérés par Monaco Editor ;
- rendu automatique local du diagramme ;
- import de fichiers `.puml`, `.plantuml` et `.txt` ;
- rendu, export et téléchargement du diagramme en `.svg` ;
- copie du code et de l'URL ;
- zoom de l'aperçu ;
- mode clair et sombre ;
- persistance locale du document dans `localStorage` avec identifiant stable
  et hash de source ;
- cache SVG de session dans `sessionStorage`, indexé par hash, avec action de
  suppression depuis Workspace ;
- URLs locales courtes basées sur le hash du schéma.

Les schémas sont conservés dans leur ordre de création. Leur sélection ne
modifie donc pas l'ordre de la liste Workspace. Le hash sert à détecter les
modifications de source et à éviter un rendu lorsque le SVG est déjà présent
dans le cache de session. Le cache est recréé au fil des rendus après la
fermeture d'une session. Une URL basée sur ce hash fonctionne sur le même
stockage local ; elle ne transporte volontairement pas le code PlantUML dans
l'URL.

## Raccourcis clavier

| Raccourci | Action |
| --- | --- |
| `Ctrl`/`Cmd` + `Enter` | Forcer le rendu du diagramme |
| `Ctrl`/`Cmd` + `S` | Exporter le diagramme en SVG |

## Structure utile

```text
.
├── src/
│   ├── index.ts       # Interface et logique de l'éditeur
│   ├── styles.css     # Styles de l'application
│   └── vite-env.d.ts  # Types Vite
├── index.html         # Point d'entrée HTML
├── vite.config.ts     # Configuration Vite et copie du runtime PlantUML
└── package.json       # Scripts et dépendances npm
```

Les fichiers générés par le build sont placés dans `dist/` et ne doivent pas
être modifiés manuellement.
