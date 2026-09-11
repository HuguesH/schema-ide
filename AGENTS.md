# Objectifs du projet

## Mission

Construire dans ce projet une copie fonctionnelle de l’éditeur web PlantUML disponible sur [editor.plantuml.com](https://editor.plantuml.com/).

## Contraintes techniques

- Développer l’interface applicative exclusivement en TypeScript.
- Utiliser une dépendance JavaScript/TypeScript basée sur [plantuml/plantuml.js](https://github.com/plantuml/plantuml.js).
- Exécuter le rendu PlantUML côté navigateur, sans dépendre d’un serveur PlantUML distant.
- Conserver une architecture compatible avec Vite et le build TypeScript existant.
- Préserver la sécurité et la confidentialité des sources PlantUML saisies par l’utilisateur.

## Fonctionnalités attendues

Reproduire progressivement les fonctions principales de l’éditeur PlantUML :

- éditeur de code PlantUML ;
- aperçu du diagramme ;
- rendu automatique après modification ;
- import d’un fichier PlantUML ;
- export du code source ;
- téléchargement du diagramme ;
- copie du code et de l’URL ;
- choix du format d’aperçu lorsque le moteur le permet ;
- zoom et ajustement de l’aperçu ;
- mode clair et sombre ;
- persistance locale du document ;
- raccourcis clavier usuels ;
- messages d’état et erreurs de rendu explicites.

## Sources de référence

L’interface et les comportements doivent s’inspirer des sources du répertoire `webapp` de :

<https://github.com/plantuml/plantuml-server/tree/master/src/main/webapp>

Les composants particulièrement pertinents sont :

- `components/editor`
- `components/preview`
- `components/modals`
- `js/language`
- `js/config`
- `js/utilities`

## Critères d’acceptation

- Le projet compile avec `npm run build`.
- L’application démarre avec `npm run dev` et `npm start`.
- Un diagramme PlantUML d’exemple est rendu dans le navigateur.
- Le rendu ne nécessite pas d’installation Java côté utilisateur.
- Les fonctions ajoutées restent typées et ne contournent pas TypeScript avec des casts non justifiés.
- Toute évolution importante de l’interface ou du moteur de rendu doit être validée par un build ciblé.

## Priorités

1. Fiabiliser le rendu local PlantUML.
2. Reproduire les interactions essentielles de l’éditeur officiel.
3. Améliorer la compatibilité des formats et des fonctions d’export.
4. Affiner l’interface et les comportements pour se rapprocher de `editor.plantuml.com`.
