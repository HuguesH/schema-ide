import "./styles.css";
import { decode as decodePlantUml, encode as encodePlantUml } from "plantuml-encoder";

type PlantUmlRuntime = {
  initialize(path: string): Promise<void>;
  renderSvg(source: string): Promise<Blob>;
};

declare const cjCall: (
  className: string,
  methodName: string,
  ...args: string[]
) => Promise<string>;

type RuntimeWindow = Window & {
  plantuml?: PlantUmlRuntime;
  cheerpjInit?: (options: { preloadResources: string[] }) => Promise<void>;
};

const runtimeWindow = window as RuntimeWindow;
const storageKey = "schema-ide-documents";
const currentSchemaKey = "schema-ide-current";
const defaultSource = `@startuml
title PlantUML Studio Base ####
actor User
participant "Web editor" as Editor
participant plantUML
database LocalStorage

User -> Editor ++: Write a diagram
Editor -> LocalStorage++ : Save source
return : listSchema
Editor -> plantUML++ : reder diagram
return : Rendered diagram
return : affiche schéma

@enduml`;

type SchemaDocument = {
  id: string;
  name: string;
  encoded: string;
  savedAt: string;
};

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) {
  throw new Error("Application root not found");
}

app.innerHTML = `
  <div class="app-shell">
    <header class="topbar">
      <a class="brand" href="/" aria-label="PlantUML Studio">
        <span class="brand-mark">PU</span>
        <span>PlantUML <strong>Studio</strong></span>
      </a>
      <div class="topbar-actions">
        <span class="runtime-badge" id="runtime-status"><span class="status-dot"></span> Initialisation...</span>
        <button class="icon-button" id="theme-button" title="Changer de thème" aria-label="Changer de thème">☾</button>
        <a class="icon-button" href="https://github.com/plantuml/plantuml.js" target="_blank" rel="noreferrer" title="PlantUML.js sur GitHub" aria-label="PlantUML.js sur GitHub">↗</a>
      </div>
    </header>

    <main class="workspace">
      <div class="workspace-left">
        <aside class="schema-sidebar">
          <div class="sidebar-header">
            <div>
              <span class="eyebrow">Workspace</span>
              <h2>Mes schémas</h2>
            </div>
            <div class="sidebar-actions">
              <button class="add-schema-button" id="add-schema-button" title="Nouveau schéma" aria-label="Nouveau schéma">+</button>
              <button class="collapse-workspace-button" id="collapse-workspace-button" title="Réduire Workspace" aria-label="Réduire Workspace">‹</button>
            </div>
          </div>
          <div class="schema-list" id="schema-list"></div>
        </aside>
        <section class="panel editor-panel">
        <div class="panel-header">
          <div>
            <span class="eyebrow">Source</span>
            <h1>Diagram editor</h1>
          </div>
          <div class="panel-actions">
            <button class="text-button" id="reset-button">Reset</button>
            <button class="text-button" id="copy-button">Copy</button>
            <label class="text-button file-button">
              Import
              <input id="file-input" type="file" accept=".puml,.plantuml,.txt" />
            </label>
            <button class="primary-button" id="export-button">Export SVG</button>
          </div>
        </div>
        <div class="url-bar">
          <span class="url-method">LOCAL</span>
          <input id="source-url" type="text" readonly aria-label="Adresse du diagramme" />
          <button id="url-copy-button" title="Copier le lien" aria-label="Copier le lien">⧉</button>
          <button id="url-open-button" title="Ouvrir dans une nouvelle fenêtre" aria-label="Ouvrir dans une nouvelle fenêtre">↗</button>
        </div>
        <div class="editor-wrap">
          <div class="line-numbers" id="line-numbers" aria-hidden="true"></div>
          <pre class="code-highlight" id="code-highlight" aria-hidden="true"></pre>
          <textarea id="source-editor" spellcheck="false" autocomplete="off" autocapitalize="off" aria-label="Source PlantUML"></textarea>
          <div class="editor-menu">
            <button id="editor-copy-button" title="Copier le code" aria-label="Copier le code">⧉</button>
            <button id="render-button" title="Rendre le diagramme (Ctrl+Entrée)" aria-label="Rendre le diagramme">▶</button>
          </div>
        </div>
        <div class="editor-footer">
          <span id="source-stats">0 lignes · 0 caractères</span>
          <span><kbd>Ctrl</kbd><span class="key-plus">+</span><kbd>Enter</kbd> pour rendre</span>
        </div>
        </section>
      </div>

      <section class="panel preview-panel">
        <div class="panel-header preview-header">
          <div>
            <span class="eyebrow">Preview</span>
            <h2>Diagram preview</h2>
          </div>
          <div class="preview-tools">
            <button class="icon-button small" id="zoom-out" title="Réduire">−</button>
            <span id="zoom-value">100%</span>
            <button class="icon-button small" id="zoom-in" title="Agrandir">+</button>
            <button class="icon-button small" id="fit-button" title="Ajuster">⌗</button>
          </div>
        </div>
        <div class="preview-stage" id="preview-stage">
          <div class="empty-preview" id="empty-preview">
            <div class="empty-icon">◇</div>
            <strong>Votre diagramme apparaîtra ici</strong>
            <span>Écrivez du code PlantUML à gauche.</span>
          </div>
          <img id="diagram-image" alt="Aperçu du diagramme PlantUML" />
          <div class="loading-overlay" id="loading-overlay"><span class="spinner"></span> Rendu du diagramme...</div>
        </div>
        <div class="preview-footer">
          <span id="render-status">Prêt</span>
          <button class="download-button" id="download-button">↓ Télécharger SVG</button>
        </div>
      </section>
    </main>

    <footer class="footer">
      <span>PlantUML Studio</span>
      <span>Propulsé par <a href="https://github.com/plantuml/plantuml.js" target="_blank" rel="noreferrer">PlantUML.js</a></span>
      <span>Rendu local dans votre navigateur</span>
    </footer>
  </div>
`;

const editor = document.querySelector<HTMLTextAreaElement>("#source-editor")!;
const lineNumbers = document.querySelector<HTMLDivElement>("#line-numbers")!;
const codeHighlight = document.querySelector<HTMLPreElement>("#code-highlight")!;
const image = document.querySelector<HTMLImageElement>("#diagram-image")!;
const emptyPreview = document.querySelector<HTMLDivElement>("#empty-preview")!;
const loadingOverlay = document.querySelector<HTMLDivElement>("#loading-overlay")!;
const renderStatus = document.querySelector<HTMLSpanElement>("#render-status")!;
const runtimeStatus = document.querySelector<HTMLSpanElement>("#runtime-status")!;
const sourceUrl = document.querySelector<HTMLInputElement>("#source-url")!;
const sourceStats = document.querySelector<HTMLSpanElement>("#source-stats")!;
const zoomValue = document.querySelector<HTMLSpanElement>("#zoom-value")!;
const schemaList = document.querySelector<HTMLDivElement>("#schema-list")!;

let runtime: PlantUmlRuntime | undefined;
let currentImageUrl: string | undefined;
let zoom = 1;
let renderTimer: number | undefined;
let schemas: SchemaDocument[] = [];
let currentSchemaId = "";

function createSchema(name = "Schéma sans titre", source = defaultSource): SchemaDocument {
  return {
    id: crypto.randomUUID(),
    name,
    encoded: encodePlantUml(source),
    savedAt: new Date().toISOString(),
  };
}

function getSchemaSource(schema: SchemaDocument): string {
  return decodePlantUml(schema.encoded);
}

function getSchemaName(source: string): string {
  const title = source.match(/^\s*title\s+(.+?)\s*$/im)?.[1]?.trim();
  return title || "Schéma sans titre";
}

function buildShareUrl(source: string): string {
  return `${window.location.origin}${window.location.pathname}#${encodePlantUml(source)}`;
}

function loadSchemaFromUrl(): SchemaDocument | undefined {
  const encoded = window.location.hash.slice(1);
  if (!encoded) return undefined;
  try {
    const source = decodePlantUml(encoded);
    if (!source.includes("@start")) return undefined;
    return {
      id: crypto.randomUUID(),
      name: getSchemaName(source),
      encoded,
      savedAt: new Date().toISOString(),
    };
  } catch {
    return undefined;
  }
}

function loadSchemas(): void {
  try {
    const storedSchemas = JSON.parse(localStorage.getItem(storageKey) ?? "[]") as unknown;
    schemas = Array.isArray(storedSchemas)
      ? storedSchemas.flatMap((schema): SchemaDocument[] => {
        if (typeof schema !== "object" || schema === null) return [];
        const candidate = schema as Partial<SchemaDocument> & { source?: unknown };
        if (
          typeof candidate.id !== "string"
          || typeof candidate.name !== "string"
          || typeof candidate.savedAt !== "string"
        ) return [];
        if (typeof candidate.encoded === "string") {
          return [{ id: candidate.id, name: candidate.name, encoded: candidate.encoded, savedAt: candidate.savedAt }];
        }
        if (typeof candidate.source === "string") {
          return [{
            id: candidate.id,
            name: getSchemaName(candidate.source),
            encoded: encodePlantUml(candidate.source),
            savedAt: candidate.savedAt,
          }];
        }
        return [];
      })
      : [];
  } catch {
    schemas = [];
  }

  const urlSchema = loadSchemaFromUrl();
  if (urlSchema) {
    const existingSchema = schemas.find((schema) => schema.encoded === urlSchema.encoded);
    if (existingSchema) {
      urlSchema.id = existingSchema.id;
    } else {
      schemas.push(urlSchema);
    }
  } else if (schemas.length === 0) {
    schemas = [createSchema()];
  }
  currentSchemaId = urlSchema?.id ?? localStorage.getItem(currentSchemaKey) ?? schemas[0].id;
  if (!schemas.some((schema) => schema.id === currentSchemaId)) {
    currentSchemaId = schemas[0].id;
  }
}

function persistSchemas(): void {
  localStorage.setItem(storageKey, JSON.stringify(schemas));
  localStorage.setItem(currentSchemaKey, currentSchemaId);
}

function formatSavedAt(savedAt: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(savedAt));
}

function renderSchemaList(): void {
  schemaList.replaceChildren();
  for (const schema of [...schemas].sort((left, right) => right.savedAt.localeCompare(left.savedAt))) {
    const item = document.createElement("div");
    item.className = "schema-item";
    item.classList.toggle("active", schema.id === currentSchemaId);
    item.innerHTML = '<button class="schema-select" type="button"><strong></strong><span></span></button><div class="schema-item-actions"><button class="schema-external-link" type="button" title="Ouvrir dans une nouvelle fenêtre" aria-label="Ouvrir ce schéma dans une nouvelle fenêtre">↗</button><button class="schema-delete-button" type="button" title="Supprimer ce schéma" aria-label="Supprimer ce schéma">🗑</button></div>';
    item.querySelector("strong")!.textContent = schema.name;
    item.querySelector("span")!.textContent = formatSavedAt(schema.savedAt);
    item.querySelector(".schema-select")!.addEventListener("click", () => selectSchema(schema.id));
    item.querySelector(".schema-external-link")!.addEventListener("click", (event) => {
      event.stopPropagation();
      window.open(buildShareUrl(getSchemaSource(schema)), "_blank", "noopener,noreferrer");
    });
    item.querySelector(".schema-delete-button")!.addEventListener("click", (event) => {
      event.stopPropagation();
      deleteSchema(schema.id);
    });
    schemaList.append(item);
  }
}

function selectSchema(schemaId: string): void {
  const schema = schemas.find((item) => item.id === schemaId);
  if (!schema || schema.id === currentSchemaId) return;
  const currentSchema = schemas.find((item) => item.id === currentSchemaId);
  if (currentSchema) {
    currentSchema.encoded = encodePlantUml(editor.value);
  }
  currentSchemaId = schema.id;
  editor.value = getSchemaSource(schema);
  renderSchemaList();
  updateEditorChrome();
  void renderDiagram();
  persistSchemas();
}

function addSchema(): void {
  const schema = createSchema(`Schéma ${schemas.length + 1}`);
  const currentSchema = schemas.find((item) => item.id === currentSchemaId);
  if (currentSchema) currentSchema.encoded = encodePlantUml(editor.value);
  schemas.push(schema);
  currentSchemaId = schema.id;
  editor.value = getSchemaSource(schema);
  renderSchemaList();
  updateEditorChrome();
  void renderDiagram();
  persistSchemas();
}

function deleteSchema(schemaId: string): void {
  const schemaIndex = schemas.findIndex((schema) => schema.id === schemaId);
  if (schemaIndex === -1) return;

  const schema = schemas[schemaIndex];
  if (!window.confirm(`Supprimer « ${schema.name} » de votre stockage local ?`)) return;

  const wasCurrentSchema = schema.id === currentSchemaId;
  schemas.splice(schemaIndex, 1);
  if (schemas.length === 0) {
    schemas.push(createSchema());
  }

  if (wasCurrentSchema) {
    const nextSchema = schemas[Math.min(schemaIndex, schemas.length - 1)];
    currentSchemaId = nextSchema.id;
    editor.value = getSchemaSource(nextSchema);
    updateEditorChrome();
    void renderDiagram();
  }

  renderSchemaList();
  persistSchemas();
}

function updateEditorChrome(): void {
  const lines = editor.value.split("\n");
  lineNumbers.textContent = lines.map((_, index) => String(index + 1)).join("\n");
  codeHighlight.innerHTML = highlightPlantUml(editor.value);
  sourceStats.textContent = `${lines.length} lignes · ${editor.value.length} caractères`;
  sourceUrl.value = buildShareUrl(editor.value);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[character] ?? character));
}

function highlightPlantUml(source: string): string {
  const tokenPattern = /(\/\/.*$|'.*$|@[a-zA-Z][\w-]*|\b(?:actor|boundary|control|database|entity|file|folder|frame|interface|参加|participant|queue|rectangle|stack|storage|usecase|title|header|footer|legend|note|abstract|class|enum|interface|object|package|skinparam|start|enduml|end|if|else|endif|while|endwhile|repeat|repeatwhile|fork|endfork)\b|(?:<\.\.|<<|>>|-->|<--|->|<-|==|\.{2})|#[a-zA-Z0-9_-]+)/gim;
  let output = "";
  let cursor = 0;

  for (const match of source.matchAll(tokenPattern)) {
    const token = match[0];
    const index = match.index ?? 0;
    output += escapeHtml(source.slice(cursor, index));
    const escapedToken = escapeHtml(token);
    const tokenClass = token.startsWith("'") || token.startsWith("//")
      ? "token-comment"
      : token.startsWith("@")
        ? "token-directive"
        : token.startsWith("#")
          ? "token-color"
          : /^(?:->|<-|-->|<--|==|\.{2}|<\.\.|<<|>>)$/.test(token)
            ? "token-arrow"
            : "token-keyword";
    output += `<span class="${tokenClass}">${escapedToken}</span>`;
    cursor = index + token.length;
  }

  return output + escapeHtml(source.slice(cursor)) + "\n";
}

function setZoom(nextZoom: number): void {
  zoom = Math.min(2, Math.max(0.5, nextZoom));
  zoomValue.textContent = `${Math.round(zoom * 100)}%`;
  image.style.transform = `scale(${zoom})`;
}

function setLoading(loading: boolean): void {
  loadingOverlay.classList.toggle("visible", loading);
  document.body.classList.toggle("is-loading", loading);
}

async function copyText(text: string, button?: HTMLElement): Promise<void> {
  await navigator.clipboard.writeText(text);
  if (button) {
    const original = button.textContent;
    button.textContent = "Copié";
    window.setTimeout(() => { button.textContent = original; }, 1200);
  }
}

async function renderDiagram(): Promise<void> {
  const source = editor.value.trim();
  if (!source || !runtime) return;
  setLoading(true);
  renderStatus.textContent = "Rendu en cours...";
  try {
    const blob = await runtime.renderSvg(source);
    if (currentImageUrl) URL.revokeObjectURL(currentImageUrl);
    currentImageUrl = URL.createObjectURL(blob);
    image.src = currentImageUrl;
    image.classList.add("visible");
    emptyPreview.classList.add("hidden");
    renderStatus.textContent = `Rendu terminé · ${new Date().toLocaleTimeString("fr-FR")}`;
    const currentSchema = schemas.find((schema) => schema.id === currentSchemaId);
    if (currentSchema) {
      currentSchema.encoded = encodePlantUml(editor.value);
      currentSchema.name = getSchemaName(editor.value);
      currentSchema.savedAt = new Date().toISOString();
      renderSchemaList();
      persistSchemas();
    }
    history.replaceState(null, "", buildShareUrl(editor.value));
  } catch (error) {
    renderStatus.textContent = "Erreur de rendu";
    console.error(error);
  } finally {
    setLoading(false);
  }
}

function scheduleRender(): void {
  updateEditorChrome();
  window.clearTimeout(renderTimer);
  renderTimer = window.setTimeout(() => void renderDiagram(), 700);
}

function loadClassicScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Impossible de charger ${src}`));
    document.head.append(script);
  });
}

async function initializeRuntime(): Promise<void> {
  const basePath = import.meta.env.DEV
    ? "/node_modules/@sakirtemel/plantuml.js"
    : "/plantuml-wasm";
  try {
    await loadClassicScript("https://cjrtnc.leaningtech.com/2.3/loader.js");
    await loadClassicScript(`${basePath}/plantuml.js`);
    const bridge = document.createElement("script");
    bridge.textContent = "globalThis.plantuml = plantuml;";
    document.head.append(bridge);
    runtime = runtimeWindow.plantuml;
    if (!runtime) throw new Error("API PlantUML.js indisponible");
    await runtime.initialize(`/app${basePath}`);
    const runtimeApi = runtimeWindow.plantuml;
    if (!runtimeApi) throw new Error("API PlantUML.js indisponible");
    runtimeApi.renderSvg = (source: string) => new Promise<Blob>((resolve, reject) => {
      cjCall("com.plantuml.wasm.v1.Svg", "convert", "light", source)
        .then((result) => {
          if (!result) {
            reject(new Error("Le moteur PlantUML n'a produit aucun SVG"));
            return;
          }
          if (result.trimStart().startsWith("{")) {
            const response = JSON.parse(result) as { status?: string; error?: string };
            reject(new Error(response.error ?? "Le rendu SVG a échoué"));
            return;
          }
          resolve(new Blob([result], { type: "image/svg+xml" }));
        })
        .catch(reject);
    });
    runtimeStatus.innerHTML = '<span class="status-dot ready"></span> Prêt';
    runtimeStatus.classList.add("ready");
    await renderDiagram();
  } catch (error) {
    runtimeStatus.innerHTML = '<span class="status-dot error"></span> Indisponible';
    renderStatus.textContent = "Le moteur PlantUML n'a pas pu démarrer";
    console.error(error);
  }
}

loadSchemas();
editor.value = schemas.find((schema) => schema.id === currentSchemaId)
  ? getSchemaSource(schemas.find((schema) => schema.id === currentSchemaId)!)
  : defaultSource;
renderSchemaList();
updateEditorChrome();

editor.addEventListener("input", scheduleRender);
editor.addEventListener("scroll", () => {
  lineNumbers.scrollTop = editor.scrollTop;
  codeHighlight.scrollTop = editor.scrollTop;
  codeHighlight.scrollLeft = editor.scrollLeft;
});
document.querySelector("#render-button")!.addEventListener("click", () => void renderDiagram());
document.querySelector("#copy-button")!.addEventListener("click", (event) => void copyText(editor.value, event.currentTarget as HTMLElement));
document.querySelector("#editor-copy-button")!.addEventListener("click", (event) => void copyText(editor.value, event.currentTarget as HTMLElement));
document.querySelector("#url-copy-button")!.addEventListener("click", () => void copyText(sourceUrl.value));
document.querySelector("#url-open-button")!.addEventListener("click", () => {
  window.open(sourceUrl.value, "_blank", "noopener,noreferrer");
});
document.querySelector("#reset-button")!.addEventListener("click", () => {
  editor.value = defaultSource;
  scheduleRender();
});
document.querySelector("#add-schema-button")!.addEventListener("click", addSchema);
document.querySelector("#collapse-workspace-button")!.addEventListener("click", (event) => {
  const button = event.currentTarget as HTMLButtonElement;
  const collapsed = document.querySelector(".workspace")!.classList.toggle("workspace-collapsed");
  button.textContent = collapsed ? "›" : "‹";
  button.title = collapsed ? "Développer Workspace" : "Réduire Workspace";
  button.setAttribute("aria-label", button.title);
});
document.querySelector("#theme-button")!.addEventListener("click", () => {
  document.documentElement.classList.toggle("light-theme");
});
document.querySelector("#zoom-out")!.addEventListener("click", () => setZoom(zoom - 0.1));
document.querySelector("#zoom-in")!.addEventListener("click", () => setZoom(zoom + 0.1));
document.querySelector("#fit-button")!.addEventListener("click", () => setZoom(1));
document.querySelector("#download-button")!.addEventListener("click", () => {
  if (!currentImageUrl) return;
  const link = document.createElement("a");
  link.href = currentImageUrl;
  link.download = "diagram.svg";
  link.click();
});
document.querySelector("#export-button")!.addEventListener("click", () => {
  if (!currentImageUrl) return;
  const link = document.createElement("a");
  link.href = currentImageUrl;
  link.download = "diagram.svg";
  link.click();
});
document.querySelector<HTMLInputElement>("#file-input")!.addEventListener("change", async (event) => {
  const input = event.currentTarget as HTMLInputElement;
  const file = input.files?.[0];
  if (file) {
    editor.value = await file.text();
    scheduleRender();
  }
});
window.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    void renderDiagram();
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    document.querySelector<HTMLButtonElement>("#export-button")!.click();
  }
});

void initializeRuntime();
