import * as monaco from "monaco-editor";
import "../node_modules/monaco-editor/min/vs/editor/editor.main.css";
import { decode as decodePlantUml, encode as encodePlantUml } from "plantuml-encoder";
import "./styles.css";
import { registerSchemaLanguages, type SourceLanguage } from "./monaco-languages.js";

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

type SchemaDocument = {
  id: string;
  name: string;
  encoded: string;
  hash: string;
  modifiedAt: string;
  renderedAt?: string;
  language: SourceLanguage;
};

const runtimeWindow = window as RuntimeWindow;
const storageKey = "schema-ide-documents";
const currentSchemaKey = "schema-ide-current";
const svgCacheKey = "schema-ide-svg-cache";
const defaultSource = `@startuml
title PlantUML Studio Base ####
actor User
participant "Web editor" as Editor
participant plantUML
database LocalStorage

User -> Editor ++: Write a diagram
Editor -> LocalStorage++ : Save source
return : listSchema
Editor -> plantUML++ : render diagram
return : Rendered diagram
return : affiche schéma

@enduml`;

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Application root not found");

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
              <button class="clear-cache-button" id="clear-cache-button" title="Supprimer le cache SVG de la session" aria-label="Supprimer le cache SVG de la session">⌫</button>
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
              <select class="language-select" id="source-language" aria-label="Langage source">
                <option value="plantuml">PlantUML</option>
                <option value="structurizr">Structurizr DSL</option>
              </select>
              <button class="text-button" id="reset-button">Reset</button>
              <button class="text-button" id="copy-button">Copy</button>
              <label class="text-button file-button">
                Import
                <input id="file-input" type="file" accept=".puml,.plantuml,.dsl,.txt" />
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
            <div id="source-editor" aria-label="Source PlantUML"></div>
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

const query = <T extends Element>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
};

const editorHost = query<HTMLDivElement>("#source-editor");
const image = query<HTMLImageElement>("#diagram-image");
const emptyPreview = query<HTMLDivElement>("#empty-preview");
const loadingOverlay = query<HTMLDivElement>("#loading-overlay");
const renderStatus = query<HTMLSpanElement>("#render-status");
const runtimeStatus = query<HTMLSpanElement>("#runtime-status");
const sourceUrl = query<HTMLInputElement>("#source-url");
const sourceStats = query<HTMLSpanElement>("#source-stats");
const zoomValue = query<HTMLSpanElement>("#zoom-value");
const schemaList = query<HTMLDivElement>("#schema-list");
const languageSelect = query<HTMLSelectElement>("#source-language");

globalThis.MonacoEnvironment = {
  getWorker: () => new Worker(new URL("./monaco-editor.worker.ts", import.meta.url), { type: "module" }),
};
registerSchemaLanguages();

const monacoEditor = monaco.editor.create(editorHost, {
  automaticLayout: true,
  minimap: { enabled: false },
  fontSize: 12,
  lineHeight: 20,
  padding: { top: 15, bottom: 15 },
  scrollBeyondLastLine: false,
  tabSize: 2,
  wordWrap: "off",
  theme: "vs-dark",
  ariaLabel: "Source PlantUML",
});

let runtime: PlantUmlRuntime | undefined;
let currentImageUrl: string | undefined;
let zoom = 1;
let renderTimer: number | undefined;
let renderSequence = 0;
let schemas: SchemaDocument[] = [];
let currentSchemaId = "";
let svgCache: Record<string, string> = {};

function createSchema(name = "Schéma sans titre", source = defaultSource, language: SourceLanguage = "plantuml"): SchemaDocument {
  const encoded = encodePlantUml(source);
  return {
    id: crypto.randomUUID(),
    name,
    encoded,
    hash: hashEncodedSource(encoded),
    modifiedAt: new Date().toISOString(),
    language,
  };
}

function hashEncodedSource(encoded: string): string {
  let hash = 14695981039346656037n;
  for (let index = 0; index < encoded.length; index += 1) {
    hash ^= BigInt(encoded.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 1099511628211n);
  }
  return hash.toString(16).padStart(16, "0");
}

function getSchemaSource(schema: SchemaDocument): string {
  return decodePlantUml(schema.encoded);
}

function getSchemaName(source: string): string {
  const title = source.match(/^\s*title\s+(.+?)\s*$/im)?.[1]?.trim();
  return title || "Schéma sans titre";
}

function loadSvgCache(): void {
  try {
    const storedCache = JSON.parse(sessionStorage.getItem(svgCacheKey) ?? "{}") as unknown;
    if (typeof storedCache !== "object" || storedCache === null || Array.isArray(storedCache)) {
      svgCache = {};
      return;
    }
    svgCache = Object.entries(storedCache).reduce<Record<string, string>>((cache, [hash, svg]) => {
      if (typeof svg === "string") cache[hash] = svg;
      return cache;
    }, {});
  } catch {
    svgCache = {};
  }
}

function persistSvgCache(): void {
  sessionStorage.setItem(svgCacheKey, JSON.stringify(svgCache));
}

function getCachedSvg(hash: string): string | undefined {
  return svgCache[hash];
}

function cacheSvg(hash: string, svg: string): void {
  svgCache[hash] = svg;
  persistSvgCache();
}

function removeCachedSvg(hash: string): void {
  if (!(hash in svgCache)) return;
  delete svgCache[hash];
  persistSvgCache();
}

function clearSvgCache(): void {
  svgCache = {};
  sessionStorage.removeItem(svgCacheKey);
}

function buildShareUrl(hash: string): string {
  return `${window.location.origin}${window.location.pathname}#${hash}`;
}

function loadSchemaFromUrl(): SchemaDocument | undefined {
  const token = window.location.hash.slice(1);
  if (!token) return undefined;
  const existingSchema = schemas.find((schema) => schema.hash === token || schema.id === token);
  if (existingSchema) return existingSchema;
  try {
    const source = decodePlantUml(token);
    if (!source.includes("@start")) return undefined;
    const encoded = token;
    return {
      id: crypto.randomUUID(),
      name: getSchemaName(source),
      encoded,
      hash: hashEncodedSource(encoded),
      modifiedAt: new Date().toISOString(),
      language: "plantuml",
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
        const candidate = schema as Partial<SchemaDocument> & { source?: unknown; savedAt?: unknown };
        if (typeof candidate.id !== "string" || typeof candidate.name !== "string") return [];
        const language: SourceLanguage = candidate.language === "structurizr" ? "structurizr" : "plantuml";
        const modifiedAt = typeof candidate.modifiedAt === "string"
          ? candidate.modifiedAt
          : typeof candidate.savedAt === "string"
            ? candidate.savedAt
            : new Date().toISOString();
        const renderedAt = typeof candidate.renderedAt === "string" ? candidate.renderedAt : undefined;
        if (typeof candidate.encoded === "string") {
          return [{
            id: candidate.id,
            name: candidate.name,
            encoded: candidate.encoded,
            hash: typeof candidate.hash === "string" ? candidate.hash : hashEncodedSource(candidate.encoded),
            modifiedAt,
            renderedAt,
            language,
          }];
        }
        if (typeof candidate.source === "string") {
          const encoded = encodePlantUml(candidate.source);
          return [{
            id: candidate.id,
            name: getSchemaName(candidate.source),
            encoded,
            hash: hashEncodedSource(encoded),
            modifiedAt,
            renderedAt,
            language,
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
    const existingSchema = schemas.find((schema) => schema.hash === urlSchema.hash);
    if (existingSchema) urlSchema.id = existingSchema.id;
    else schemas.push(urlSchema);
  } else if (schemas.length === 0) {
    schemas = [createSchema()];
  }
  currentSchemaId = urlSchema?.id ?? localStorage.getItem(currentSchemaKey) ?? schemas[0].id;
  if (!schemas.some((schema) => schema.id === currentSchemaId)) currentSchemaId = schemas[0].id;
}

function persistSchemas(): void {
  localStorage.setItem(storageKey, JSON.stringify(schemas));
  localStorage.setItem(currentSchemaKey, currentSchemaId);
}

function currentSchema(): SchemaDocument | undefined {
  return schemas.find((schema) => schema.id === currentSchemaId);
}

function renderSchemaList(): void {
  schemaList.replaceChildren();
  for (const schema of schemas) {
    const item = document.createElement("div");
    item.className = "schema-item";
    item.classList.toggle("active", schema.id === currentSchemaId);
    item.innerHTML = '<button class="schema-select" type="button"><strong></strong><span class="schema-details"></span><span class="schema-activity"><span class="schema-modified"></span><span class="schema-rendered"></span></span></button><div class="schema-item-actions"><button class="schema-external-link" type="button" title="Ouvrir dans une nouvelle fenêtre" aria-label="Ouvrir ce schéma dans une nouvelle fenêtre">↗</button><button class="schema-delete-button" type="button" title="Supprimer ce schéma" aria-label="Supprimer ce schéma">🗑</button></div>';
    queryIn(item, "strong").textContent = schema.name;
    queryIn<HTMLSpanElement>(item, ".schema-details").textContent = `${schema.language === "structurizr" ? "Structurizr" : "PlantUML"} · ID ${schema.id}`;
    queryIn<HTMLSpanElement>(item, ".schema-modified").textContent = `Modifié ${formatActivityTime(schema.modifiedAt)}`;
    queryIn<HTMLSpanElement>(item, ".schema-rendered").textContent = `Rendu ${schema.renderedAt ? formatActivityTime(schema.renderedAt) : "jamais"}`;
    queryIn<HTMLButtonElement>(item, ".schema-select").addEventListener("click", () => selectSchema(schema.id));
    queryIn<HTMLButtonElement>(item, ".schema-external-link").addEventListener("click", (event) => {
      event.stopPropagation();
      window.open(buildShareUrl(schema.hash), "_blank", "noopener,noreferrer");
    });
    queryIn<HTMLButtonElement>(item, ".schema-delete-button").addEventListener("click", (event) => {
      event.stopPropagation();
      deleteSchema(schema.id);
    });
    schemaList.append(item);
  }
}

function formatActivityTime(timestamp: string): string {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(new Date(timestamp));
}

function queryIn<T extends Element>(parent: Element, selector: string): T {
  const element = parent.querySelector<T>(selector);
  if (!element) throw new Error(`Missing child element: ${selector}`);
  return element;
}

function setSource(source: string, language: SourceLanguage): void {
  monacoEditor.getModel()?.setValue(source);
  const model = monacoEditor.getModel();
  if (model) monaco.editor.setModelLanguage(model, language);
  languageSelect.value = language;
}

function cancelScheduledRender(): void {
  window.clearTimeout(renderTimer);
  renderTimer = undefined;
}

function saveEditorToSchema(schema: SchemaDocument): boolean {
  const source = monacoEditor.getValue().trim();
  const encoded = encodePlantUml(source);
  const hash = hashEncodedSource(encoded);
  if (schema.hash === hash && schema.encoded === encoded) return false;
  const previousHash = schema.hash;
  schema.encoded = encoded;
  schema.hash = hash;
  schema.name = getSchemaName(source);
  removeCachedSvg(previousHash);
  schema.modifiedAt = new Date().toISOString();
  schema.renderedAt = undefined;
  return true;
}

function selectSchema(schemaId: string): void {
  const schema = schemas.find((item) => item.id === schemaId);
  if (!schema || schema.id === currentSchemaId) return;
  const active = currentSchema();
  if (active) saveEditorToSchema(active);
  currentSchemaId = schema.id;
  const source = getSchemaSource(schema);
  setSource(source, schema.language);
  cancelScheduledRender();
  renderSchemaList();
  updateEditorChrome();
  void renderDiagram(source);
  persistSchemas();
}

function addSchema(): void {
  const schema = createSchema(`Schéma ${schemas.length + 1}`);
  const active = currentSchema();
  if (active) saveEditorToSchema(active);
  schemas.push(schema);
  currentSchemaId = schema.id;
  setSource(getSchemaSource(schema), schema.language);
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
  if (schemas.length === 0) schemas.push(createSchema());
  if (wasCurrentSchema) {
    const nextSchema = schemas[Math.min(schemaIndex, schemas.length - 1)];
    currentSchemaId = nextSchema.id;
    setSource(getSchemaSource(nextSchema), nextSchema.language);
    updateEditorChrome();
    void renderDiagram();
  }
  renderSchemaList();
  persistSchemas();
}

function updateEditorChrome(): void {
  const source = monacoEditor.getValue();
  const lines = source.split("\n");
  sourceStats.textContent = `${lines.length} lignes · ${source.length} caractères`;
  sourceUrl.value = buildShareUrl(hashEncodedSource(encodePlantUml(source)));
  const active = currentSchema();
  if (active) languageSelect.value = active.language;
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

function displaySvg(svg: string): void {
  if (currentImageUrl) URL.revokeObjectURL(currentImageUrl);
  currentImageUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  image.src = currentImageUrl;
  image.classList.add("visible");
  emptyPreview.classList.add("hidden");
}

async function copyText(text: string, button?: HTMLButtonElement): Promise<void> {
  await navigator.clipboard.writeText(text);
  if (button) {
    const original = button.textContent;
    button.textContent = "Copié";
    window.setTimeout(() => { button.textContent = original; }, 1200);
  }
}

async function renderDiagram(source = monacoEditor.getValue().trim(), forceRender = false): Promise<void> {
  source = source.trim();
  if (!source) return;
  const sequence = ++renderSequence;
  setLoading(true);
  renderStatus.textContent = "Rendu en cours...";
  try {
    const encoded = encodePlantUml(source);
    const hash = hashEncodedSource(encoded);
    const active = currentSchema();
    if (active) saveEditorToSchema(active);
    const cachedSvg = getCachedSvg(hash);
    if (!forceRender && active && active.hash === hash && cachedSvg) {
      displaySvg(cachedSvg);
      renderStatus.textContent = `Rendu restauré · ${new Date().toLocaleTimeString("fr-FR")}`;
      history.replaceState(null, "", buildShareUrl(hash));
      return;
    }
    if (!runtime) return;
    const blob = await runtime.renderSvg(source);
    const svg = await blob.text();
    if (sequence !== renderSequence) return;
    displaySvg(svg);
    renderStatus.textContent = `Rendu terminé · ${new Date().toLocaleTimeString("fr-FR")}`;
    if (active) {
      active.encoded = encoded;
      active.hash = hash;
      active.name = getSchemaName(source);
      active.renderedAt = new Date().toISOString();
      cacheSvg(hash, svg);
      renderSchemaList();
      persistSchemas();
    }
    history.replaceState(null, "", buildShareUrl(hash));
  } catch (error) {
    if (sequence === renderSequence) {
      renderStatus.textContent = error instanceof Error ? `Erreur de rendu · ${error.message}` : "Erreur de rendu";
      console.error(error);
    }
  } finally {
    if (sequence === renderSequence) setLoading(false);
  }
}

function scheduleRender(): void {
  updateEditorChrome();
  cancelScheduledRender();
  renderTimer = window.setTimeout(() => void renderDiagram(monacoEditor.getValue().trim(), true), 700);
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
  const basePath = import.meta.env.DEV ? "/node_modules/@sakirtemel/plantuml.js" : "/plantuml-wasm";
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
            const response = JSON.parse(result) as { error?: string };
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
loadSvgCache();
persistSchemas();
const initialSchema = currentSchema() ?? createSchema();
setSource(getSchemaSource(initialSchema), initialSchema.language);
renderSchemaList();
updateEditorChrome();

monacoEditor.onDidChangeModelContent(() => scheduleRender());
monacoEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => void renderDiagram(undefined, true));
monacoEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => query<HTMLButtonElement>("#export-button").click());

query<HTMLButtonElement>("#render-button").addEventListener("click", () => void renderDiagram(undefined, true));
query<HTMLButtonElement>("#copy-button").addEventListener("click", (event) => {
  const button = event.currentTarget;
  if (button instanceof HTMLButtonElement) void copyText(monacoEditor.getValue(), button);
});
query<HTMLButtonElement>("#editor-copy-button").addEventListener("click", (event) => {
  const button = event.currentTarget;
  if (button instanceof HTMLButtonElement) void copyText(monacoEditor.getValue(), button);
});
query<HTMLButtonElement>("#url-copy-button").addEventListener("click", () => void copyText(sourceUrl.value));
query<HTMLButtonElement>("#url-open-button").addEventListener("click", () => window.open(sourceUrl.value, "_blank", "noopener,noreferrer"));
query<HTMLButtonElement>("#reset-button").addEventListener("click", () => {
  const active = currentSchema();
  if (active) {
    active.language = "plantuml";
    persistSchemas();
  }
  setSource(defaultSource, "plantuml");
});
query<HTMLButtonElement>("#add-schema-button").addEventListener("click", addSchema);
query<HTMLButtonElement>("#clear-cache-button").addEventListener("click", () => {
  clearSvgCache();
  renderStatus.textContent = "Cache SVG de session supprimé";
});
query<HTMLButtonElement>("#collapse-workspace-button").addEventListener("click", (event) => {
  const button = event.currentTarget;
  if (!(button instanceof HTMLButtonElement)) return;
  const collapsed = document.querySelector(".workspace")?.classList.toggle("workspace-collapsed") ?? false;
  button.textContent = collapsed ? "›" : "‹";
  button.title = collapsed ? "Développer Workspace" : "Réduire Workspace";
  button.setAttribute("aria-label", button.title);
});
query<HTMLButtonElement>("#theme-button").addEventListener("click", () => {
  const light = document.documentElement.classList.toggle("light-theme");
  monaco.editor.setTheme(light ? "vs" : "vs-dark");
});
query<HTMLSelectElement>("#source-language").addEventListener("change", (event) => {
  const select = event.currentTarget;
  if (!(select instanceof HTMLSelectElement)) return;
  const language: SourceLanguage = select.value === "structurizr" ? "structurizr" : "plantuml";
  const active = currentSchema();
  if (active) {
    active.language = language;
    const model = monacoEditor.getModel();
    if (model) monaco.editor.setModelLanguage(model, language);
    renderSchemaList();
    persistSchemas();
  }
});
query<HTMLButtonElement>("#zoom-out").addEventListener("click", () => setZoom(zoom - 0.1));
query<HTMLButtonElement>("#zoom-in").addEventListener("click", () => setZoom(zoom + 0.1));
query<HTMLButtonElement>("#fit-button").addEventListener("click", () => setZoom(1));
const downloadDiagram = (): void => {
  if (!currentImageUrl) return;
  const link = document.createElement("a");
  link.href = currentImageUrl;
  link.download = "diagram.svg";
  link.click();
};
query<HTMLButtonElement>("#download-button").addEventListener("click", downloadDiagram);
query<HTMLButtonElement>("#export-button").addEventListener("click", downloadDiagram);
query<HTMLInputElement>("#file-input").addEventListener("change", async (event) => {
  const input = event.currentTarget;
  if (!(input instanceof HTMLInputElement)) return;
  const file = input.files?.[0];
  if (file) {
    const language: SourceLanguage = file.name.endsWith(".dsl") ? "structurizr" : "plantuml";
    const active = currentSchema();
    if (active) {
      active.language = language;
      persistSchemas();
    }
    setSource(await file.text(), language);
    scheduleRender();
  }
});
window.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    void renderDiagram(undefined, true);
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    query<HTMLButtonElement>("#export-button").click();
  }
});

void initializeRuntime();
