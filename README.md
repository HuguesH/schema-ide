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

- édition de code PlantUML avec coloration syntaxique ;
- numéros de ligne synchronisés avec le contenu ;
- rendu automatique local du diagramme ;
- import de fichiers `.puml`, `.plantuml` et `.txt` ;
- rendu, export et téléchargement du diagramme en `.svg` ;
- copie du code et de l'URL ;
- zoom de l'aperçu ;
- mode clair et sombre ;
- persistance locale du document dans `localStorage`.

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
