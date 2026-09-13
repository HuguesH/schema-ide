import * as monaco from "monaco-editor";

export type SourceLanguage = "plantuml" | "structurizr";

type CompletionDefinition = {
  label: string;
  detail: string;
  insertText?: string;
  kind: monaco.languages.CompletionItemKind;
  snippet?: boolean;
};

const plantUmlKeywords = [
  "actor", "agent", "boundary", "card", "circle", "class", "cloud", "component",
  "control", "database", "entity", "file", "folder", "frame", "interface", "node",
  "object", "participant", "queue", "rectangle", "stack", "storage", "usecase",
  "abstract", "enum", "package", "namespace", "title", "header", "footer", "legend",
  "note", "note over", "note left", "note right", "skinparam", "hide", "show",
  "autonumber", "alt", "else", "end", "loop", "opt", "par", "break", "critical",
  "group", "box", "activate", "deactivate", "return", "ref", "newpage", "scale",
  "left to right direction", "top to bottom direction", "@startuml", "@enduml",
];

const structurizrKeywords = [
  "workspace", "model", "views", "configuration", "styles", "theme", "include",
  "person", "softwareSystem", "container", "component", "deploymentNode",
  "infrastructureNode", "softwareSystemInstance", "containerInstance", "instance",
  "group", "relationship", "properties", "url", "description", "technology",
  "tags", "perspectives", "view", "systemContext", "containerView", "componentView",
  "dynamic", "deployment", "filtered", "image", "autoLayout", "default",
];

const plantUmlSnippets: CompletionDefinition[] = [
  { label: "startuml", detail: "PlantUML diagram", insertText: "@startuml\n${1:Diagram}\n\n@enduml", kind: monaco.languages.CompletionItemKind.Snippet, snippet: true },
  { label: "participant", detail: "Participant declaration", insertText: 'participant "${1:Name}" as ${2:Alias}', kind: monaco.languages.CompletionItemKind.Snippet, snippet: true },
  { label: "class", detail: "Class declaration", insertText: "class ${1:Name} {\n  ${2:field}\n}", kind: monaco.languages.CompletionItemKind.Snippet, snippet: true },
  { label: "sequence", detail: "Sequence diagram starter", insertText: "@startuml\nparticipant ${1:Client}\nparticipant ${2:Server}\n${1:Client} -> ${2:Server}: ${3:request}\n@enduml", kind: monaco.languages.CompletionItemKind.Snippet, snippet: true },
];

const structurizrSnippets: CompletionDefinition[] = [
  { label: "workspace", detail: "Structurizr workspace", insertText: 'workspace "${1:Name}" "${2:Description}" {\n  model {\n    ${3: user = person "User"}\n  }\n  views {\n    ${4:systemContext user "Context"}\n  }\n}', kind: monaco.languages.CompletionItemKind.Snippet, snippet: true },
  { label: "person", detail: "Person declaration", insertText: '${1:user} = person "${2:User}" "${3:Description}"', kind: monaco.languages.CompletionItemKind.Snippet, snippet: true },
  { label: "softwareSystem", detail: "Software system declaration", insertText: '${1:system} = softwareSystem "${2:System}" "${3:Description}"', kind: monaco.languages.CompletionItemKind.Snippet, snippet: true },
  { label: "container", detail: "Container declaration", insertText: '${1:container} = container "${2:Container}" "${3:Description}" "${4:Technology}"', kind: monaco.languages.CompletionItemKind.Snippet, snippet: true },
];

const registeredLanguages = new Set<SourceLanguage>();

function declaredIdentifiers(source: string, language: SourceLanguage): string[] {
  const pattern = language === "plantuml"
    ? /^\s*(?:actor|agent|boundary|class|cloud|component|control|database|entity|file|folder|frame|interface|node|object|participant|queue|rectangle|stack|storage|usecase)\s+(?:"[^"]+"\s+as\s+)?([A-Za-z_][\w.-]*)/gim
    : /^\s*([A-Za-z_][\w-]*)\s*=\s*(?:person|softwareSystem|container|component|deploymentNode|infrastructureNode|group)\b/gim;
  return [...source.matchAll(pattern)]
    .map((match) => match[1])
    .filter((identifier): identifier is string => Boolean(identifier))
    .filter((identifier, index, all) => all.indexOf(identifier) === index);
}

function completionDefinitions(language: SourceLanguage): CompletionDefinition[] {
  const keywords = (language === "plantuml" ? plantUmlKeywords : structurizrKeywords).map((label) => ({
    label,
    detail: `${language === "plantuml" ? "PlantUML" : "Structurizr DSL"} keyword`,
    kind: monaco.languages.CompletionItemKind.Keyword,
  }));
  return [...keywords, ...(language === "plantuml" ? plantUmlSnippets : structurizrSnippets)];
}

function registerLanguage(language: SourceLanguage): void {
  if (registeredLanguages.has(language)) return;
  const languageId = language;
  monaco.languages.register({
    id: languageId,
    aliases: language === "plantuml" ? ["PlantUML", "puml"] : ["Structurizr DSL", "structurizr"],
    extensions: language === "plantuml" ? [".puml", ".plantuml"] : [".dsl"],
  });
  monaco.languages.setMonarchTokensProvider(languageId, {
    tokenizer: {
      root: [
        [/^\s*(startuml|enduml)\b/, "keyword.directive"],
        [/^\s*(workspace|model|views|configuration|styles|person|softwareSystem|container|component|deploymentNode|infrastructureNode)\b/, "keyword"],
        [/^\s*(actor|agent|boundary|class|cloud|component|control|database|entity|file|folder|frame|interface|node|object|participant|queue|rectangle|stack|storage|usecase|title|skinparam|note|legend)\b/, "keyword"],
        [/"[^"]*"/, "string"],
        [/'[^']*$/, "comment"],
        [/\/\/.*$/, "comment"],
        [/#(?:[0-9a-f]{3,8}|[\w-]+)/i, "number"],
        [/[A-Za-z_][\w.-]*/, "identifier"],
        [/[{}()[\]:=]/, "delimiter"],
        [/(-->|<--|->|<-|\.{2}|==)/, "operator"],
      ],
    },
  });
  monaco.languages.registerCompletionItemProvider(languageId, {
    triggerCharacters: ["@", ":"],
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position);
      const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, position.column);
      const definitions = completionDefinitions(language);
      const suggestions = definitions.map((definition) => ({
        label: definition.label,
        kind: definition.kind,
        detail: definition.detail,
        insertText: definition.insertText ?? definition.label,
        insertTextRules: definition.snippet
          ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
          : undefined,
        range,
      }));
      const identifiers = declaredIdentifiers(model.getValue(), language).map((identifier) => ({
        label: identifier,
        kind: monaco.languages.CompletionItemKind.Reference,
        detail: "Declared identifier",
        insertText: identifier,
        range,
      }));
      return { suggestions: [...suggestions, ...identifiers] };
    },
  });
  registeredLanguages.add(language);
}

export function registerSchemaLanguages(): void {
  registerLanguage("plantuml");
  registerLanguage("structurizr");
}
