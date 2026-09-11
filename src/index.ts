import "./styles.css";

type PlantUmlRuntime = {
  initialize(path: string): Promise<void>;
  renderPng(source: string): Promise<Blob>;
};

type RuntimeWindow = Window & {
  plantuml?: PlantUmlRuntime;
  cheerpjInit?: (options: { preloadResources: string[] }) => Promise<void>;
};

const runtimeWindow = window as RuntimeWindow;
const storageKey = "schema-ide-source";
const defaultSource = `@startuml
title PlantUML Studio

actor User
participant "Web editor" as Editor
database Database

User -> Editor: Write a diagram
Editor -> Database: Save source
Database --> Editor: Source loaded
Editor --> User: Rendered diagram
@enduml`;

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
            <button class="primary-button" id="export-button">Export</button>
          </div>
        </div>
        <div class="url-bar">
          <span class="url-method">LOCAL</span>
          <input id="source-url" type="text" readonly aria-label="Adresse du diagramme" />
          <button id="url-copy-button" title="Copier le lien" aria-label="Copier le lien">⧉</button>
        </div>
        <div class="editor-wrap">
          <div class="line-numbers" id="line-numbers" aria-hidden="true"></div>
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

      <section class="panel preview-panel">
        <div class="panel-header preview-header">
          <div>
            <span class="eyebrow">Preview</span>
            <h2>Diagram preview</h2>
          </div>
          <div class="preview-tools">
            <button class="view-button active" data-view="png">PNG</button>
            <button class="view-button" data-view="source">SOURCE</button>
            <span class="tool-separator"></span>
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
          <pre id="source-preview"></pre>
          <div class="loading-overlay" id="loading-overlay"><span class="spinner"></span> Rendu du diagramme...</div>
        </div>
        <div class="preview-footer">
          <span id="render-status">Prêt</span>
          <button class="download-button" id="download-button">↓ Télécharger PNG</button>
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
const image = document.querySelector<HTMLImageElement>("#diagram-image")!;
const sourcePreview = document.querySelector<HTMLPreElement>("#source-preview")!;
const emptyPreview = document.querySelector<HTMLDivElement>("#empty-preview")!;
const loadingOverlay = document.querySelector<HTMLDivElement>("#loading-overlay")!;
const renderStatus = document.querySelector<HTMLSpanElement>("#render-status")!;
const runtimeStatus = document.querySelector<HTMLSpanElement>("#runtime-status")!;
const sourceUrl = document.querySelector<HTMLInputElement>("#source-url")!;
const sourceStats = document.querySelector<HTMLSpanElement>("#source-stats")!;
const zoomValue = document.querySelector<HTMLSpanElement>("#zoom-value")!;

let runtime: PlantUmlRuntime | undefined;
let currentImageUrl: string | undefined;
let zoom = 1;
let renderTimer: number | undefined;

function updateEditorChrome(): void {
  const lines = editor.value.split("\n");
  lineNumbers.textContent = lines.map((_, index) => String(index + 1)).join("\n");
  sourceStats.textContent = `${lines.length} lignes · ${editor.value.length} caractères`;
  sourcePreview.textContent = editor.value;
  sourceUrl.value = `${window.location.origin}${window.location.pathname}#${encodeURIComponent(editor.value).slice(0, 72)}`;
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
    const blob = await runtime.renderPng(source);
    if (currentImageUrl) URL.revokeObjectURL(currentImageUrl);
    currentImageUrl = URL.createObjectURL(blob);
    image.src = currentImageUrl;
    image.classList.add("visible");
    emptyPreview.classList.add("hidden");
    renderStatus.textContent = `Rendu terminé · ${new Date().toLocaleTimeString("fr-FR")}`;
    localStorage.setItem(storageKey, editor.value);
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
    runtimeStatus.innerHTML = '<span class="status-dot ready"></span> Prêt';
    runtimeStatus.classList.add("ready");
    await renderDiagram();
  } catch (error) {
    runtimeStatus.innerHTML = '<span class="status-dot error"></span> Indisponible';
    renderStatus.textContent = "Le moteur PlantUML n'a pas pu démarrer";
    console.error(error);
  }
}

editor.value = localStorage.getItem(storageKey) ?? defaultSource;
updateEditorChrome();

editor.addEventListener("input", scheduleRender);
editor.addEventListener("scroll", () => {
  lineNumbers.scrollTop = editor.scrollTop;
});
document.querySelector("#render-button")!.addEventListener("click", () => void renderDiagram());
document.querySelector("#copy-button")!.addEventListener("click", (event) => void copyText(editor.value, event.currentTarget as HTMLElement));
document.querySelector("#editor-copy-button")!.addEventListener("click", (event) => void copyText(editor.value, event.currentTarget as HTMLElement));
document.querySelector("#url-copy-button")!.addEventListener("click", () => void copyText(sourceUrl.value));
document.querySelector("#reset-button")!.addEventListener("click", () => {
  editor.value = defaultSource;
  scheduleRender();
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
  link.download = "diagram.png";
  link.click();
});
document.querySelector("#export-button")!.addEventListener("click", () => {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([editor.value], { type: "text/plain" }));
  link.download = "diagram.puml";
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
document.querySelectorAll<HTMLButtonElement>(".view-button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".view-button").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    const sourceView = button.dataset.view === "source";
    sourcePreview.classList.toggle("visible", sourceView);
    image.classList.toggle("visible", !sourceView && Boolean(image.src));
  });
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
