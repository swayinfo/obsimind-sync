var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => ObsimindUpgrade
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var DEFAULT_SETTINGS = {
  apiKey: "",
  baseUrl: "",
  scriptsFolder: "0. Files/4. Templates/Scripts",
  buttonsNote: "0. Files/0. Settings/\u0413\u043B\u0430\u0432\u043D\u044B\u0435 MOC/MOC - Buttons - \u041A\u043D\u043E\u043F\u043A\u0438.md",
  mocNote: "0. Files/0. Settings/Главные MOC/MOC - HOME.md",
  versionPin: "",
  // пусто = берём версию по умолчанию (current.txt на сервере)
  installedVersion: "",
  // ещё ничего не ставили
  // Какая Система у подписчика (спрашиваем один раз перед первой установкой):
  //   ""    — ещё не выбирал;
  //   "old" — переходит со СТАРОГО шаблона: разовый прогон на версии v0 (мост);
  //   "new" — уже на новой Системе: обычная версия сервера (current.txt = v1 и новее).
  track: "",
  // Мост v0 уже пройден — дальше подписчик обновляется как все.
  bridgeDone: false,
  // По умолчанию ВЫКЛ: версия меняется редко и по твоей воле (current.txt),
  // навязчивая проверка не нужна. Подписчик включает, если хочет уведомления.
  notifyOnStartup: false,
  makeBak: true,
  autoReloadQuickadd: true,
  createMissingSettings: true,
  lastShownMessage: "",
  history: [],
  // Точки полного отката (снимок до «Установить ВСЁ»): файлы + список плагинов.
  restorePoints: [],
  // Мастер обновлений: показывать каждое изменение отдельно и спрашивать ДА/НЕТ.
  wizard: true,
  // id изменений, которые подписчик уже принял — повторно не спрашиваем.
  installedItems: [],
  // id изменений, от которых отказался. Предложим снова, но по умолчанию «НЕТ».
  declinedItems: []
};
var CONFIG_FILE = "config-settings.json";
var BAK_DIR = ".obsimind-bak";
var MAX_SESSIONS = 20;
var MAX_BAK_PER_FILE = 5;
var MAX_RESTORE_POINTS = 3;
var PROTECTED_NEVER_WRITE = /* @__PURE__ */ new Set(["config-settings.json"]);
var ECOSYSTEM_PLUGIN_ID = "obsimind-ecosystem";
var DEFAULT_REMOVE_PLUGINS = ["collapse-linked-mentions", "kanban-auto-backlinks", "kanban-new-project"];
var DEFAULT_BASE_URL = "https://api.eltonlabs.org";
var DEFAULT_PROVIDER_ID = "elton_int";
function isWritablePluginFile(name) {
  if (name.includes("/") || name.includes("\\"))
    return false;
  return /\.(js|json|css)$/i.test(name);
}
async function sha256Hex(buf) {
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function cmpVer(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d)
      return d > 0 ? 1 : -1;
  }
  return 0;
}
function verTagCmp(a, b) {
  const na = parseInt(String(a).replace(/^v/i, ""), 10) || 0;
  const nb = parseInt(String(b).replace(/^v/i, ""), 10) || 0;
  return na - nb;
}
function isWritableScript(name) {
  if (name.includes("/") || name.includes("\\"))
    return false;
  if (!name.toLowerCase().endsWith(".js"))
    return false;
  return true;
}
function escapeRegExpOMS(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
/* Переписывает пути, ВСТРОЕННЫЕ в строку (литералы JSON/JS), на границе пути:
   перед old — начало строки или не-путевой символ; после old — '/', конец или
   не-путевой символ (кавычка, пробел, скобка, ':' и т.п.). Хвост-потомок
   (…/Файл.md) сохраняется автоматически. Возвращает новую строку или null,
   если ни одна пара не сработала. Пары применяются по очереди (заранее
   сортируются «более длинный old → раньше», чтобы не задеть короткий префикс). */
function rewriteEmbeddedPaths(text, pairs) {
  if (typeof text !== "string" || !text)
    return null;
  let cur = text, changed = false;
  for (const p of pairs) {
    const re = new RegExp("(^|[^\\p{L}\\p{N}_./-])" + escapeRegExpOMS(p.old) + "(?=$|[/\"'\\s),\\]:#?\\\\])", "gu");
    const next = cur.replace(re, (m, pre) => {
      changed = true;
      return pre + p.neo;
    });
    cur = next;
  }
  return changed ? cur : null;
}
var ObsimindUpgrade = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.settings = DEFAULT_SETTINGS;
    this.running = false;
  }
  async onload() {
    await this.loadSettings();
    this.addCommand({ id: "install-all", name: "\u{1F680} \u0423\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C / \u043E\u0431\u043D\u043E\u0432\u0438\u0442\u044C \u0412\u0421\u0401 (\u0441\u043A\u0440\u0438\u043F\u0442\u044B + \u043F\u043B\u0430\u0433\u0438\u043D + \u043E\u0444\u043E\u0440\u043C\u043B\u0435\u043D\u0438\u0435)", callback: () => this.start() });
    this.addCommand({ id: "check-updates", name: "\u041F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u043D\u043E\u0432\u0443\u044E \u0432\u0435\u0440\u0441\u0438\u044E", callback: () => this.checkOnly(false) });
    this.addCommand({ id: "update-scripts", name: "\u041E\u0431\u043D\u043E\u0432\u0438\u0442\u044C \u0441\u043A\u0440\u0438\u043F\u0442\u044B (\u0432\u0441\u0435)", callback: () => this.updateAll() });
    this.addCommand({ id: "select-updates", name: "\u0412\u044B\u0431\u0440\u0430\u0442\u044C \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u044F\u2026", callback: () => this.openSelectModal() });
    this.addCommand({ id: "install-integrations", name: "\u0423\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C \u043D\u043E\u0432\u044B\u0435 \u0441\u043A\u0440\u0438\u043F\u0442\u044B (QuickAdd + \u043A\u043D\u043E\u043F\u043A\u0438)", callback: () => this.integrate() });
    this.addCommand({ id: "install-ecosystem", name: "\u0423\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C / \u043E\u0431\u043D\u043E\u0432\u0438\u0442\u044C Obsimind Ecosystem", callback: () => this.installEcosystem() });
    this.addCommand({ id: "install-extras", name: "\u041E\u0431\u043D\u043E\u0432\u0438\u0442\u044C \u043E\u0444\u043E\u0440\u043C\u043B\u0435\u043D\u0438\u0435 \u0438 \u043F\u0430\u043D\u0435\u043B\u044C (css, \u0434\u043E\u043C\u0430\u0448\u043D\u044F\u044F, Commander)", callback: () => this.installExtras() });
    this.addCommand({ id: "rollback", name: "\u041E\u0442\u043A\u0430\u0442 / \u0438\u0441\u0442\u043E\u0440\u0438\u044F \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0439\u2026", callback: () => new RollbackModal(this.app, this).open() });
    this.addCommand({ id: "restore-all", name: "\u21A9\uFE0F \u0412\u0435\u0440\u043D\u0443\u0442\u044C \u0412\u0421\u0401 \u043D\u0430\u0437\u0430\u0434 (\u043F\u043E\u043B\u043D\u044B\u0439 \u043E\u0442\u043A\u0430\u0442 \u0434\u043E \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0438)\u2026", callback: () => new RestoreAllModal(this.app, this).open() });
    this.addCommand({ id: "whats-new", name: "\u2728 \u0427\u0442\u043E \u043D\u043E\u0432\u043E\u0433\u043E / \u0438\u0437\u043C\u0435\u043D\u0438\u0442\u044C \u0432\u044B\u0431\u043E\u0440 \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0439\u2026", callback: () => this.openWizard() });
    this.addSettingTab(new ObsimindSettingTab(this.app, this));
    if (this.settings.notifyOnStartup) {
      this.app.workspace.onLayoutReady(() => this.checkOnly(true));
    }
  }
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    if (!Array.isArray(this.settings.history))
      this.settings.history = [];
    if (!Array.isArray(this.settings.restorePoints))
      this.settings.restorePoints = [];
    this.settings.makeBak = true;
    this.settings.createMissingSettings = true;
    this.settings.autoReloadQuickadd = true;
    this.settings.wizard = true;
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  folder() {
    return this.settings.scriptsFolder.replace(/\/+$/, "");
  }
  folderExists(p) {
    return this.app.vault.getAbstractFileByPath(p) instanceof import_obsidian.TFolder;
  }
  /* Находит реальную папку скриптов по якорю config-settings.json — он есть у
     каждого подписчика. Если подписчик переименовал папки, путь найдётся сам.
     При нескольких совпадениях берём папку с наибольшим числом .js-скриптов. */
  detectScriptsFolder() {
    var _a, _b;
    const hits = this.app.vault.getFiles().filter((f) => f.name === CONFIG_FILE);
    if (!hits.length)
      return null;
    let best = null, bestScore = -1;
    for (const h of hits) {
      const dir = (_b = (_a = h.parent) == null ? void 0 : _a.path) != null ? _b : "";
      const score = this.app.vault.getFiles().filter((f) => {
        var _a2, _b2;
        return ((_b2 = (_a2 = f.parent) == null ? void 0 : _a2.path) != null ? _b2 : "") === dir && f.extension === "js";
      }).length;
      if (score > bestScore) {
        bestScore = score;
        best = dir;
      }
    }
    return best;
  }
  /* Гарантирует валидную папку скриптов перед операциями:
     1) настроенная существует — ок;
     2) нашли по config-settings.json (подписчик переименовал) — берём её;
     3) interactive — спрашиваем подписчика модалкой; иначе — false. */
  async ensureScriptsFolderReady(interactive) {
    if (this.folderExists(this.folder())) {
      await this.ensureConfigSettings();
      return true;
    }
    const detected = this.detectScriptsFolder();
    if (detected) {
      if (detected !== this.folder()) {
        this.settings.scriptsFolder = detected;
        await this.saveSettings();
        new import_obsidian.Notice(`\u{1F4C1} \u041D\u0430\u0448\u0451\u043B \u0442\u0432\u043E\u044E \u043F\u0430\u043F\u043A\u0443 \u0441\u043A\u0440\u0438\u043F\u0442\u043E\u0432: ${detected}`, 8e3);
      }
      return true;
    }
    // \u0421\u0442\u0430\u0440\u044B\u0439 \u043F\u043E\u0434\u043F\u0438\u0441\u0447\u0438\u043A: \u044F\u043A\u043E\u0440\u044F config-settings.json \u0435\u0449\u0451 \u043D\u0435\u0442 \u0438 \u043F\u0430\u043F\u043A\u0430 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430 \u2014
    // \u0441\u043E\u0437\u0434\u0430\u0451\u043C \u043F\u0430\u043F\u043A\u0443 \u0441\u043A\u0440\u0438\u043F\u0442\u043E\u0432 \u043F\u043E \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0435 (\u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E 0. Files/4. Templates/Scripts)
    // \u0438 \u043F\u0440\u043E\u0434\u043E\u043B\u0436\u0430\u0435\u043C. \u041D\u0438\u043A\u0430\u043A\u0438\u0445 \u043C\u043E\u0434\u0430\u043B\u043E\u043A \u2014 \u0430\u043F\u0433\u0440\u0435\u0439\u0434 \u0438\u0434\u0451\u0442 \u0432 \u043E\u0434\u0438\u043D \u043A\u043B\u0438\u043A.
    const target = this.folder();
    if (target) {
      await this.ensureFolder(target);
      await this.ensureConfigSettings();
      new import_obsidian.Notice(`\uD83D\uDCC1 \u041F\u0430\u043F\u043A\u0430 \u0441\u043A\u0440\u0438\u043F\u0442\u043E\u0432 \u0433\u043E\u0442\u043E\u0432\u0430: ${target}`, 7e3);
      return true;
    }
    if (!interactive)
      return false;
    const picked = await pickFolder(this.app, this.folder());
    if (!picked) {
      new import_obsidian.Notice("\u041E\u0442\u043C\u0435\u043D\u0435\u043D\u043E: \u043F\u0430\u043F\u043A\u0430 \u0441\u043A\u0440\u0438\u043F\u0442\u043E\u0432 \u043D\u0435 \u0432\u044B\u0431\u0440\u0430\u043D\u0430.", 7e3);
      return false;
    }
    this.settings.scriptsFolder = picked.replace(/\/+$/, "");
    await this.saveSettings();
    await this.ensureFolder(this.settings.scriptsFolder);
    return true;
  }
  /* Если заметка по настроенному пути не найдена — ищем по имени файла
     (подписчик мог переименовать/переместить). Найдём — запоминаем путь,
     чтобы не плодить дубликаты при записи. */
  /* Шаблоны имён для фаззи-поиска заметки, если подписчик её переименовал. */
  notePatterns(key) {
    if (key === "buttonsNote")
      return [/moc.*button/i, /button.*кноп/i, /кнопк/i, /button/i];
    if (key === "mocNote")
      return [/moc\s*-\s*home/i, /домашн/i];
    return [];
  }
  async resolveNotePath(key) {
    const configured = this.settings[key];
    if (configured && this.app.vault.getAbstractFileByPath(configured))
      return configured;
    const md = this.app.vault.getMarkdownFiles();
    const setFound = async (p) => {
      if (p && p !== configured) {
        this.settings[key] = p;
        await this.saveSettings();
      }
      return p;
    };
    const base = (configured || "").split("/").pop();
    if (base) {
      let hit = md.find((f) => f.name === base);
      if (!hit)
        hit = md.find((f) => f.name.toLowerCase() === base.toLowerCase());
      if (hit)
        return setFound(hit.path);
    }
    for (const re of this.notePatterns(key)) {
      const hit = md.find((f) => re.test(f.name));
      if (hit)
        return setFound(hit.path);
    }
    return configured;
  }
  /* Создаёт папку (и промежуточные), если её нет — для подписчиков с нуля. */
  async ensureFolder(folderPath) {
    const adapter = this.app.vault.adapter;
    const parts = folderPath.split("/").filter(Boolean);
    let cur = "";
    for (const p of parts) {
      cur = cur ? `${cur}/${p}` : p;
      if (!await adapter.exists(cur)) {
        try {
          await adapter.mkdir(cur);
        } catch (e) {
        }
      }
    }
  }
  /* Создаёт недостающие файлы настроек (seeds) — для старых подписчиков, у
     которых, например, не было kinopoisk-settings.json. НИКОГДА не перезаписывает
     существующие (там могут быть ключи юзера) и НИКОГДА не трогает config-settings.json. */
  async ensureSeeds(manifest) {
    if (!this.settings.createMissingSettings)
      return [];
    const seeds = manifest.seeds || {};
    const names = Object.keys(seeds);
    if (!names.length)
      return [];
    const adapter = this.app.vault.adapter;
    const folder = this.folder();
    await this.ensureFolder(folder);
    const created = [];
    for (const name of names) {
      if (name.includes("/") || name.includes("\\"))
        continue;
      if (PROTECTED_NEVER_WRITE.has(name.toLowerCase()))
        continue;
      const p = `${folder}/${name}`;
      try {
        if (await adapter.exists(p))
          continue;
        await adapter.write(p, seeds[name]);
        created.push(name);
      } catch (e) {
      }
    }
    return created;
  }
  async resolveCreds() {
    let { baseUrl, apiKey } = this.settings;
    if (!baseUrl || !apiKey) {
      const cfgPath = `${this.folder()}/${CONFIG_FILE}`;
      try {
        const cfg = JSON.parse(await this.app.vault.adapter.read(cfgPath));
        baseUrl = baseUrl || cfg.baseUrl;
        apiKey = apiKey || cfg.apiKey;
      } catch (e) {
      }
    }
    if (!baseUrl)
      baseUrl = DEFAULT_BASE_URL;
    return { baseUrl: String(baseUrl || "").replace(/\/+$/, ""), apiKey: String(apiKey || "") };
  }
  /* Старый подписчик ввёл ключ в настройках, а config-settings.json у него нет.
     Создаём его в папке скриптов — тогда заработает и обновление, и сами скрипты
     (они читают ключ оттуда). Существующий config НЕ перезаписываем (там личный ключ). */
  async ensureConfigSettings() {
    try {
      const apiKey = String(this.settings.apiKey || "").trim();
      if (!apiKey)
        return;
      const folder = this.folder();
      if (!folder)
        return;
      const cfgPath = `${folder}/${CONFIG_FILE}`;
      const adapter = this.app.vault.adapter;
      if (await adapter.exists(cfgPath))
        return;
      await this.ensureFolder(folder);
      const baseUrl = String(this.settings.baseUrl || "").trim() || DEFAULT_BASE_URL;
      await adapter.write(cfgPath, JSON.stringify({ providerId: DEFAULT_PROVIDER_ID, baseUrl, apiKey }, null, 2));
      new import_obsidian.Notice("\u{1F511} Ключ сохранён в config-settings.json", 6e3);
    } catch (e) {
    }
  }
  /* Query-параметр версии для запросов к серверу.
     С манифестом — пинимся на его resolvedVersion (чтобы скачивание файлов шло
     из той же версии, что и манифест). Без манифеста — берём пин из настроек
     (пусто = сервер сам решит по current.txt). */
  verParam(manifest) {
    const v = ((manifest == null ? void 0 : manifest.resolvedVersion) || this.settings.versionPin || "").trim();
    return v ? `?v=${encodeURIComponent(v)}` : "";
  }
  /* Какую версию просить у сервера для ЭТОГО прогона.
     Ручной пин из «Дополнительно» — сильнее всего (это для тестов).
     Иначе: подписчик со старого шаблона, ещё не прошедший мост → v0;
     все остальные → пусто (сервер сам отдаст current.txt: v1 и новее). */
  trackVersion() {
    const manual = String(this.settings.versionPin || "").trim();
    if (manual)
      return manual;
    if (this.settings.track === "old" && !this.settings.bridgeDone)
      return "v0";
    return "";
  }
  /* Запоминает установленную версию (из resolvedVersion манифеста). */
  async markInstalled(manifest) {
    const v = manifest.resolvedVersion;
    if (v && this.settings.installedVersion !== v) {
      this.settings.installedVersion = v;
      await this.saveSettings();
    }
  }
  async fetchManifest(pin) {
    const { baseUrl, apiKey } = await this.resolveCreds();
    if (!baseUrl || !apiKey)
      throw new Error("\u041D\u0435\u0442 API \u043A\u043B\u044E\u0447\u0430. \u0417\u0430\u043F\u043E\u043B\u043D\u0438 config-settings.json \u0438\u043B\u0438 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u043F\u043B\u0430\u0433\u0438\u043D\u0430.");
    const v = String(pin != null ? pin : this.trackVersion()).trim();
    const q = v ? `?v=${encodeURIComponent(v)}` : "";
    const res = await (0, import_obsidian.requestUrl)({
      url: `${baseUrl}/scripts/manifest${q}`,
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
      throw: false
    });
    if (res.status === 401 || res.status === 403)
      throw new Error("\u041A\u043B\u044E\u0447 \u043D\u0435\u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u0435\u043D \u0438\u043B\u0438 \u043F\u043E\u0434\u043F\u0438\u0441\u043A\u0430 \u043D\u0435\u0430\u043A\u0442\u0438\u0432\u043D\u0430 (403).");
    if (res.status !== 200)
      throw new Error(`\u041C\u0430\u043D\u0438\u0444\u0435\u0441\u0442 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D: HTTP ${res.status}`);
    const manifest = res.json;
    if (!manifest || typeof manifest.scripts !== "object")
      throw new Error("\u0421\u0435\u0440\u0432\u0435\u0440 \u0432\u0435\u0440\u043D\u0443\u043B \u043D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 \u043C\u0430\u043D\u0438\u0444\u0435\u0441\u0442.");
    return { manifest, baseUrl, apiKey };
  }
  /* Различия с сервером по хэшу. isNew = файла ещё нет локально. */
  async diff(manifest) {
    const adapter = this.app.vault.adapter;
    const folder = this.folder();
    const out = [];
    for (const [name, meta] of Object.entries(manifest.scripts)) {
      if (!isWritableScript(name))
        continue;
      const p = `${folder}/${name}`;
      const exists = await adapter.exists(p);
      let local = null;
      if (exists) {
        try {
          local = await sha256Hex(await adapter.readBinary(p));
        } catch (e) {
        }
      }
      if (local !== meta.sha256)
        out.push({ name, isNew: !exists });
    }
    return out;
  }
  async precheck(manifest) {
    if (manifest.minPluginVersion && cmpVer(this.manifest.version, manifest.minPluginVersion) < 0) {
      new import_obsidian.Notice(`\u26A0\uFE0F \u041D\u0443\u0436\u043D\u0430 \u043D\u043E\u0432\u0430\u044F \u0432\u0435\u0440\u0441\u0438\u044F \u043F\u043B\u0430\u0433\u0438\u043D\u0430 (${manifest.minPluginVersion}+). \u041E\u0431\u043D\u043E\u0432\u0438 \u0447\u0435\u0440\u0435\u0437 BRAT.`, 9e3);
      return false;
    }
    if (manifest.message && manifest.message !== this.settings.lastShownMessage) {
      new import_obsidian.Notice(manifest.message, 15e3);
      this.settings.lastShownMessage = manifest.message;
      await this.saveSettings();
    }
    return true;
  }
  /* ── Команды ──────────────────────────────────────────────── */
  /* Проверка НОВОЙ ВЕРСИИ контента (current.txt на сервере), без сверки хэшей
     файлов. Спрашиваем сервер БЕЗ пина — чтобы увидеть актуальную версию по умолчанию. */
  async checkOnly(silentIfNone) {
    if (this.running)
      return;
    try {
      const { baseUrl, apiKey } = await this.resolveCreds();
      if (!baseUrl || !apiKey) {
        if (!silentIfNone)
          new import_obsidian.Notice("\u041D\u0435\u0442 API \u043A\u043B\u044E\u0447\u0430. \u0417\u0430\u043F\u043E\u043B\u043D\u0438 config-settings.json \u0438\u043B\u0438 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438.");
        return;
      }
      const res = await (0, import_obsidian.requestUrl)({
        url: `${baseUrl}/scripts/manifest`,
        // без ?v= — узнаём дефолтную версию сервера
        method: "GET",
        headers: { Authorization: `Bearer ${apiKey}` },
        throw: false
      });
      if (res.status === 401 || res.status === 403) {
        if (!silentIfNone)
          new import_obsidian.Notice("\u041A\u043B\u044E\u0447 \u043D\u0435\u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u0435\u043D \u0438\u043B\u0438 \u043F\u043E\u0434\u043F\u0438\u0441\u043A\u0430 \u043D\u0435\u0430\u043A\u0442\u0438\u0432\u043D\u0430 (403).");
        return;
      }
      if (res.status !== 200) {
        if (!silentIfNone)
          new import_obsidian.Notice(`\u0421\u0435\u0440\u0432\u0435\u0440 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D: HTTP ${res.status}`);
        return;
      }
      const manifest = res.json;
      if (!await this.precheck(manifest))
        return;
      const server = (manifest.resolvedVersion || "").trim();
      const cur = (this.settings.installedVersion || "").trim();
      if (!cur) {
        if (!silentIfNone)
          new import_obsidian.Notice(`\u041A\u043E\u043D\u0442\u0435\u043D\u0442 \u0435\u0449\u0451 \u043D\u0435 \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D. \u041D\u0430\u0436\u043C\u0438 \xAB\u0423\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C / \u043E\u0431\u043D\u043E\u0432\u0438\u0442\u044C \u0412\u0421\u0401\xBB (\u0441\u0435\u0440\u0432\u0435\u0440 \u043D\u0430 ${server || "\u2014"}).`, 9e3);
        return;
      }
      if (server && verTagCmp(server, cur) > 0) {
        new import_obsidian.Notice(`\u{1F195} \u0414\u043E\u0441\u0442\u0443\u043F\u043D\u0430 \u043D\u043E\u0432\u0430\u044F \u0432\u0435\u0440\u0441\u0438\u044F: ${server} (\u0443 \u0442\u0435\u0431\u044F ${cur}).
\u041E\u0431\u043D\u043E\u0432\u0438 \u043A\u043E\u043C\u0430\u043D\u0434\u043E\u0439 \xAB\u0423\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C / \u043E\u0431\u043D\u043E\u0432\u0438\u0442\u044C \u0412\u0421\u0401\xBB.`, 12e3);
      } else if (!silentIfNone) {
        new import_obsidian.Notice(`\u2705 \u0423 \u0442\u0435\u0431\u044F \u0430\u043A\u0442\u0443\u0430\u043B\u044C\u043D\u0430\u044F \u0432\u0435\u0440\u0441\u0438\u044F (${cur}).`);
      }
    } catch (e) {
      this.err(e);
    }
  }
  async updateAll() {
    if (this.running)
      return;
    this.running = true;
    try {
      const { manifest, baseUrl, apiKey } = await this.fetchManifest();
      if (!await this.precheck(manifest))
        return;
      if (!await this.ensureScriptsFolderReady(true))
        return;
      const created = await this.ensureSeeds(manifest);
      const changed = await this.diff(manifest);
      if (!changed.length && !created.length) {
        new import_obsidian.Notice("\u2705 \u0412\u0441\u0435 \u0441\u043A\u0440\u0438\u043F\u0442\u044B \u0430\u043A\u0442\u0443\u0430\u043B\u044C\u043D\u044B");
        return;
      }
      const r = changed.length ? await this.downloadAndRecord(baseUrl, apiKey, manifest, changed.map((c) => c.name)) : { done: [], failed: [], skipped: [] };
      this.reportUpdate(r, created);
      await this.markInstalled(manifest);
    } catch (e) {
      this.err(e);
    } finally {
      this.running = false;
    }
  }
  async openSelectModal() {
    if (this.running)
      return;
    try {
      const { manifest, baseUrl, apiKey } = await this.fetchManifest();
      if (!await this.precheck(manifest))
        return;
      if (!await this.ensureScriptsFolderReady(true))
        return;
      const changed = await this.diff(manifest);
      if (!changed.length) {
        new import_obsidian.Notice("\u2705 \u0412\u0441\u0435 \u0441\u043A\u0440\u0438\u043F\u0442\u044B \u0430\u043A\u0442\u0443\u0430\u043B\u044C\u043D\u044B");
        return;
      }
      new UpdateModal(this.app, changed, async (selected) => {
        if (!selected.length)
          return;
        this.running = true;
        try {
          const created = await this.ensureSeeds(manifest);
          const r = await this.downloadAndRecord(baseUrl, apiKey, manifest, selected);
          this.reportUpdate(r, created);
          await this.markInstalled(manifest);
        } catch (e) {
          this.err(e);
        } finally {
          this.running = false;
        }
      }).open();
    } catch (e) {
      this.err(e);
    }
  }
  async integrate() {
    if (this.running)
      return;
    this.running = true;
    try {
      const { manifest, baseUrl, apiKey } = await this.fetchManifest();
      if (!await this.precheck(manifest))
        return;
      if (!await this.ensureScriptsFolderReady(true))
        return;
      const created = await this.ensureSeeds(manifest);
      const changed = await this.diff(manifest);
      const r = await this.downloadAndRecord(baseUrl, apiKey, manifest, changed.map((c) => c.name));
      const rep = await this.applyIntegrations(manifest);
      let msg = "\u{1F50C} \u0418\u043D\u0442\u0435\u0433\u0440\u0430\u0446\u0438\u0438:\n";
      msg += `\u0424\u0430\u0439\u043B\u044B: ${r.done.length ? r.done.join(", ") : "\u2014"}
`;
      if (created.length)
        msg += `\u{1F195} \u0421\u043E\u0437\u0434\u0430\u043D\u044B \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438: ${created.join(", ")}
`;
      msg += `QuickAdd: ${rep.qaAdded.length ? rep.qaAdded.join(", ") : "\u2014"}
`;
      msg += `\u041A\u043D\u043E\u043F\u043A\u0438: ${rep.btnAdded.length ? rep.btnAdded.join(", ") : "\u2014"}`;
      const errs = [...r.failed.map((f) => "\u0444\u0430\u0439\u043B " + f), ...rep.errors];
      if (errs.length)
        msg += `
\u274C ${errs.join("; ")}`;
      if (rep.qaReloaded)
        msg += "\n\u267B\uFE0F QuickAdd \u043F\u0435\u0440\u0435\u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043D.";
      msg += "\n" + await this.applyExtrasReport(manifest);
      if (r.done.length)
        msg += "\n\u267B\uFE0F \u041F\u0435\u0440\u0435\u0437\u0430\u043F\u0443\u0441\u0442\u0438 Obsidian \u0434\u043B\u044F \u043F\u0440\u0438\u043C\u0435\u043D\u0435\u043D\u0438\u044F \u0441\u043A\u0440\u0438\u043F\u0442\u043E\u0432.";
      await this.markInstalled(manifest);
      new import_obsidian.Notice(msg, 16e3);
    } catch (e) {
      this.err(e);
    } finally {
      this.running = false;
    }
  }
  /* Внутренний менеджер плагинов Obsidian (включить/выключить/перечитать манифесты). */
  pluginsApi() {
    return this.app.plugins;
  }
  /* ── Установка / обновление плагина Obsimind Ecosystem ───────
     Качает файлы плагина с сервера (проверка sha256), кладёт в
     .obsidian/plugins/<id>, отключает старые отдельные плагины (функции
     которых экосистема заменяет) и включает экосистему. Папки старых
     плагинов НЕ удаляются — только disable, чтобы можно было вернуть. */
  async installEcosystem() {
    if (this.running)
      return;
    this.running = true;
    try {
      const { manifest, baseUrl, apiKey } = await this.fetchManifest();
      if (!await this.precheck(manifest))
        return;
      new import_obsidian.Notice(await this.ecosystemCore(manifest, baseUrl, apiKey), 15e3);
      await this.markInstalled(manifest);
    } catch (e) {
      this.err(e);
    } finally {
      this.running = false;
    }
  }
  /* Ядро установки экосистемы — возвращает текст отчёта (используется и в «Установить ВСЁ»). */
  async ecosystemCore(manifest, baseUrl, apiKey) {
    const allSpecs = manifest.plugins || {};
    const ids = Object.keys(allSpecs).filter((id) => allSpecs[id] && allSpecs[id].files && Object.keys(allSpecs[id].files).length);
    if (!ids.length)
      return "\u2139\uFE0F \u0421\u0435\u0440\u0432\u0435\u0440 \u043F\u043E\u043A\u0430 \u043D\u0435 \u0440\u0430\u0437\u0434\u0430\u0451\u0442 \u043F\u043B\u0430\u0433\u0438\u043D\u044B.";
    const adapter = this.app.vault.adapter;
    const plugins = this.pluginsApi();
    const report = [];
    const installedOk = [];
    for (const id of ids) {
      const spec = allSpecs[id];
      const pluginDir = `${this.app.vault.configDir}/plugins/${id}`;
      await this.ensureFolder(pluginDir);
      const written = [], failed = [], skipped = [];
      for (const [name, meta] of Object.entries(spec.files)) {
        if (!isWritablePluginFile(name)) {
          skipped.push(name);
          continue;
        }
        try {
          const res = await (0, import_obsidian.requestUrl)({
            url: `${baseUrl}/plugins/${encodeURIComponent(id)}/${encodeURIComponent(name)}${this.verParam(manifest)}`,
            method: "GET",
            headers: { Authorization: `Bearer ${apiKey}` },
            throw: false
          });
          if (res.status !== 200)
            throw new Error(`HTTP ${res.status}`);
          const buf = res.arrayBuffer;
          if (await sha256Hex(buf) !== meta.sha256)
            throw new Error("\u0445\u044D\u0448 \u043D\u0435 \u0441\u043E\u0432\u043F\u0430\u043B");
          const p = `${pluginDir}/${name}`;
          // data.json \u041D\u0415 \u043F\u0435\u0440\u0435\u0437\u0430\u043F\u0438\u0441\u044B\u0432\u0430\u0435\u043C: \u043B\u0438\u0447\u043D\u044B\u0435 \u0434\u0430\u043D\u043D\u044B\u0435 \u043F\u043E\u0434\u043F\u0438\u0441\u0447\u0438\u043A\u0430; \u0434\u043B\u044F cmdr \u043E\u043D \u043C\u0435\u0440\u0436\u0438\u0442\u0441\u044F \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u043E (applyCmdr).
          if (name.toLowerCase() === "data.json" && await adapter.exists(p)) {
            skipped.push(name + " (\u0435\u0441\u0442\u044C)");
            continue;
          }
          await adapter.writeBinary(p, buf);
          written.push(name);
        } catch (e) {
          failed.push(`${name} (${e instanceof Error ? e.message : String(e)})`);
        }
      }
      const hasMain = written.some((n) => n.toLowerCase() === "main.js") || await adapter.exists(`${pluginDir}/main.js`);
      if (hasMain)
        installedOk.push(id);
      report.push({ id, version: spec.version, written, failed, hasMain });
    }
    try {
      if (plugins && plugins.loadManifests)
        await plugins.loadManifests();
    } catch (e) {
    }
    const toRemove = manifest.noRemovePlugins ? [] : Array.isArray(manifest.removePlugins) && manifest.removePlugins.length ? manifest.removePlugins : DEFAULT_REMOVE_PLUGINS;
    const disabled = [];
    for (const id of toRemove) {
      if (!(plugins && plugins.enabledPlugins && plugins.enabledPlugins.has(id)))
        continue;
      try {
        if (plugins.disablePluginAndSave)
          await plugins.disablePluginAndSave(id);
        else if (plugins.disablePlugin)
          await plugins.disablePlugin(id);
        disabled.push(id);
      } catch (e) {
      }
    }
    const enabledIds = [], enableFailed = [];
    for (const id of installedOk) {
      try {
        if (plugins == null ? void 0 : plugins.enablePluginAndSave)
          await plugins.enablePluginAndSave(id);
        else if (plugins == null ? void 0 : plugins.enablePlugin)
          await plugins.enablePlugin(id);
        enabledIds.push(id);
      } catch (e) {
        enableFailed.push(`${id} (${e instanceof Error ? e.message : String(e)})`);
      }
    }
    let msg = "\uD83E\uDDE9 \u041F\u043B\u0430\u0433\u0438\u043D\u044B:\n";
    for (const r of report) {
      msg += `\u2022 ${r.id}${r.version ? " v" + r.version : ""}: ${r.written.length ? r.written.join(", ") : r.hasMain ? "\u0430\u043A\u0442\u0443\u0430\u043B\u044C\u043D\u043E" : "\u2014"}`;
      if (r.failed.length)
        msg += ` \u274C ${r.failed.join("; ")}`;
      msg += "\n";
    }
    if (enabledIds.length)
      msg += `\u2705 \u0412\u043A\u043B\u044E\u0447\u0435\u043D\u044B: ${enabledIds.join(", ")}\n`;
    if (enableFailed.length)
      msg += `\u26A0\uFE0F \u041D\u0435 \u0432\u043A\u043B\u044E\u0447\u0438\u043B\u0438\u0441\u044C: ${enableFailed.join("; ")}\n`;
    if (disabled.length)
      msg += `\uD83D\uDEAB \u041E\u0442\u043A\u043B\u044E\u0447\u0435\u043D\u044B \u0441\u0442\u0430\u0440\u044B\u0435: ${disabled.join(", ")}\n`;
    return msg.trim();
  }
  /* \u2500\u2500 \u0422\u0435\u043C\u0430 \u043E\u0444\u043E\u0440\u043C\u043B\u0435\u043D\u0438\u044F \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
     \u041A\u0430\u0447\u0430\u0435\u0442 \u0444\u0430\u0439\u043B\u044B \u0442\u0435\u043C\u044B \u0432 .obsidian/themes/<name>/ \u0438 \u0432\u043A\u043B\u044E\u0447\u0430\u0435\u0442 \u0435\u0451 (appearance.json).
     \u041E\u0431\u043D\u043E\u0432\u043B\u044F\u0435\u0442 \u0442\u043E\u043B\u044C\u043A\u043E \u0438\u0437\u043C\u0435\u043D\u0438\u0432\u0448\u0438\u0435\u0441\u044F (\u043F\u043E sha256). */
  async applyTheme(manifest) {
    const theme = manifest.theme;
    if (!theme || !theme.name || !theme.files || !Object.keys(theme.files).length)
      return "";
    const { baseUrl, apiKey } = await this.resolveCreds();
    const adapter = this.app.vault.adapter;
    const dir = `${this.app.vault.configDir}/themes/${theme.name}`;
    await this.ensureFolder(dir);
    const written = [], failed = [];
    for (const [name, meta] of Object.entries(theme.files)) {
      if (name.includes("/") || name.includes("\\") || !/\.(css|json)$/i.test(name)) {
        failed.push(name + " (\u0438\u043C\u044F)");
        continue;
      }
      const p = `${dir}/${name}`;
      try {
        let local = null;
        if (await adapter.exists(p)) {
          try {
            local = await sha256Hex(await adapter.readBinary(p));
          } catch (e) {
          }
        }
        if (local === meta.sha256)
          continue;
        const res = await (0, import_obsidian.requestUrl)({
          url: `${baseUrl}/theme/${encodeURIComponent(theme.name)}/${encodeURIComponent(name)}${this.verParam(manifest)}`,
          method: "GET",
          headers: { Authorization: `Bearer ${apiKey}` },
          throw: false
        });
        if (res.status !== 200)
          throw new Error(`HTTP ${res.status}`);
        const buf = res.arrayBuffer;
        if (await sha256Hex(buf) !== meta.sha256)
          throw new Error("\u0445\u044D\u0448 \u043D\u0435 \u0441\u043E\u0432\u043F\u0430\u043B");
        await adapter.writeBinary(p, buf);
        written.push(name);
      } catch (e) {
        failed.push(`${name} (${e instanceof Error ? e.message : String(e)})`);
      }
    }
    let themeSet = false;
    try {
      const ap = `${this.app.vault.configDir}/appearance.json`;
      let conf = {};
      if (await adapter.exists(ap)) {
        try {
          conf = JSON.parse(await adapter.read(ap));
        } catch (e) {
        }
      }
      if (conf.cssTheme !== theme.name) {
        conf.cssTheme = theme.name;
        await adapter.write(ap, JSON.stringify(conf, null, 2));
        themeSet = true;
      }
      try {
        const cm = this.app.customCss;
        if (cm) {
          if (cm.setTheme)
            cm.setTheme(theme.name);
          else
            cm.theme = theme.name;
          if (cm.loadCss)
            cm.loadCss();
        }
      } catch (e) {
      }
    } catch (e) {
    }
    let s = `\u0422\u0435\u043C\u0430: ${theme.name}`;
    if (written.length)
      s += ` (\u0444\u0430\u0439\u043B\u044B: ${written.join(", ")})`;
    else if (!themeSet)
      s += " (\u0430\u043A\u0442\u0443\u0430\u043B\u044C\u043D\u043E)";
    if (themeSet)
      s += " \u2014 \u0432\u043A\u043B\u044E\u0447\u0435\u043D\u0430";
    if (failed.length)
      s += ` \u274C ${failed.join(", ")}`;
    return s;
  }
  /* ── ОДНА КНОПКА ДЛЯ ПОДПИСЧИКА: ставит/обновляет всё за один прогон ──
     скрипты + seeds + QuickAdd/кнопки + css/MOC/Commander + плагин ecosystem. */
  async installAll() {
    if (this.running)
      return;
    try {
      const { manifest, baseUrl, apiKey } = await this.fetchManifest();
      if (!await this.precheck(manifest))
        return;
      if (!await this.ensureScriptsFolderReady(true))
        return;
      const items = await this.changelogItems(manifest);
      if (this.settings.wizard && items.length) {
        const pending = await this.pendingItems(manifest, items);
        if (!pending.length) {
          // Все карточки уже применены. Молча доставляем только «базис» — то, что
          // не описано ни одной карточкой (если там вообще есть работа).
          const sel = this.buildSelection(manifest, items, [], []);
          const base = this.filterManifest(manifest, sel);
          if (await this.hasBaseWork(base)) {
            await this.installCore(base, baseUrl, apiKey, sel, items);
          } else {
            new import_obsidian.Notice("✅ У тебя уже всё актуально — ставить нечего.", 8e3);
          }
          return;
        }
        new UpdateWizardModal(this.app, manifest, pending, this.settings.declinedItems, async (accepted, declined) => {
          const sel = this.buildSelection(manifest, items, accepted, declined);
          await this.installCore(this.filterManifest(manifest, sel), baseUrl, apiKey, sel, items);
        }).open();
        return;
      }
      await this.installCore(manifest, baseUrl, apiKey, null);
    } catch (e) {
      this.err(e);
    }
  }
  /* ЕДИНАЯ ТОЧКА ВХОДА — кнопка «Начать» в настройках и команда «Установить ВСЁ».
     Первый раз спрашиваем версию Системы (v0 — переход со старого шаблона,
     v1 — актуальная). Дальше сразу идём в мастер согласования. */
  async start() {
    if (this.running)
      return;
    // Версия выбирается ТОЛЬКО здесь — отдельных кнопок и команд для этого нет.
    new TrackPickModal(this.app, this).open();
  }
  /* Признаки старого шаблона в этом хранилище — чтобы подсказать подписчику,
     какую версию выбрать (только чтение, ничего не меняем). */
  detectTrack() {
    const plugins = this.pluginsApi();
    const has = (id) => {
      var _a;
      try {
        return !!((_a = plugins == null ? void 0 : plugins.manifests) == null ? void 0 : _a[id]);
      } catch (e) {
        return false;
      }
    };
    const OLD_MARKERS = ["cmenu-plugin", "advanced-merger", "recent-files-obsidian", "obsidian-book-search-plugin", "auto-note-mover", "obsidian-style-settings"];
    const oldPlugins = OLD_MARKERS.filter((id) => has(id));
    const hasEcosystem = has(ECOSYSTEM_PLUGIN_ID);
    const scripts = this.app.vault.getFiles().filter((f) => f.name === CONFIG_FILE).length > 0;
    const reasons = [];
    let old = 0;
    if (oldPlugins.length) {
      old += oldPlugins.length;
      reasons.push(`нашлись плагины старого шаблона: ${oldPlugins.join(", ")}`);
    }
    if (!hasEcosystem) {
      old += 2;
      reasons.push("нет плагина Obsimind Ecosystem");
    }
    if (!scripts) {
      old += 2;
      reasons.push("нет папки скриптов с config-settings.json");
    }
    if (!old)
      reasons.push("похоже на новую Систему: экосистема и папка скриптов на месте");
    return { guess: old >= 2 ? "old" : "new", reasons };
  }
  /* Есть ли вообще работа по «базису» (то, что не описано карточками). */
  async hasBaseWork(m) {
    if ((await this.diff(m)).length)
      return true;
    if (m.moc || m.cmdr || m.theme)
      return true;
    for (const k of ["css", "notes", "integrations", "plugins", "pluginConfigs", "seeds"])
      if (Object.keys(m[k] || {}).length)
        return true;
    if ((m.obsoleteNotes || []).length || (m.migrations || []).length)
      return true;
    return false;
  }
  /* Карточки изменений для мастера. Если сервер прислал changelog.json — берём его
     (там человеческие тексты). Если нет (например v0/v1 без changelog) — собираем
     карточки сами из манифеста, чтобы подписчик всё равно согласовывал каждый шаг,
     а не получал всё молча. */
  async changelogItems(manifest) {
    const fromServer = (manifest.changelog && Array.isArray(manifest.changelog.items) ? manifest.changelog.items : []).filter((it) => it && it.id && it.title);
    if (!fromServer.length)
      return await this.buildFallbackChangelog(manifest);
    const expanded = fromServer.map((it) => this.expandItemAffects(manifest, it));
    // Сервер описал часть — остальное добираем своими карточками, чтобы НИ ОДНА
    // часть установки не проехала мимо согласования.
    const restSel = this.buildSelection(manifest, expanded, [], []);
    const rest = this.filterManifest(manifest, restSel);
    const auto = await this.buildFallbackChangelog(rest);
    return [...expanded, ...auto.map((it) => Object.assign({}, it, { id: "rest-" + it.id }))];
  }
  /* В changelog.json можно написать "*" вместо списка имён: «вся эта секция».
     Так описание не устаревает, когда в версию добавляются новые файлы.
     Разворачиваем звёздочку в реальные имена из манифеста. */
  expandItemAffects(manifest, item) {
    const a = item.affects || {};
    const SRC = {
      scripts: manifest.scripts,
      seeds: manifest.seeds,
      css: manifest.css,
      integrations: manifest.integrations,
      notes: manifest.notes,
      plugins: manifest.plugins,
      pluginConfigs: manifest.pluginConfigs
    };
    let touched = false;
    const out = {};
    for (const [k, v] of Object.entries(a)) {
      if (v === "*" && SRC[k]) {
        out[k] = Object.keys(SRC[k] || {});
        touched = true;
      } else {
        out[k] = v;
      }
    }
    return touched ? Object.assign({}, item, { affects: out }) : item;
  }
  /* Сборка карточек из манифеста: одна карточка = одна понятная часть Системы.
     Ничего не выдумываем — только то, что реально пришло с сервера. */
  async buildFallbackChangelog(manifest) {
    const items = [];
    const names = (o) => Object.keys(o || {});
    const scripts = names(manifest.scripts).filter((n) => isWritableScript(n));
    if (scripts.length) {
      let neo = [], upd = [];
      try {
        const d = await this.diff(manifest);
        neo = d.filter((x) => x.isNew).map((x) => x.name);
        upd = d.filter((x) => !x.isNew).map((x) => x.name);
      } catch (e) {
      }
      const what = [];
      if (neo.length)
        what.push(`Новых скриптов: ${neo.length} (${neo.slice(0, 6).join(", ")}${neo.length > 6 ? "…" : ""}).`);
      if (upd.length)
        what.push(`Обновится: ${upd.length} (${upd.slice(0, 6).join(", ")}${upd.length > 6 ? "…" : ""}).`);
      if (!neo.length && !upd.length)
        what.push("Все скрипты уже актуальны — файлы с совпадающим содержимым не трогаются.");
      items.push({
        id: "core-scripts",
        kind: neo.length && !upd.length ? "new" : "script",
        icon: "\u{1F9E9}",
        title: "Скрипты Системы",
        recommended: true,
        summary: `Это «мозги» Системы — то, что реально делает работу, когда ты нажимаешь кнопку: ищет, пишет, считает, обращается к ИИ. Всего ${scripts.length} файлов.`,
        what,
        how: "Делать ничего не нужно: ты как обычно нажимаешь кнопки — просто они начнут работать по-новому.",
        why: "Если оставить старые — кнопки и дашборды будут просить у них то, чего в них ещё нет, и часть вещей молча перестанет работать.",
        affects: { scripts }
      });
    }
    const seeds = names(manifest.seeds).filter((n) => !PROTECTED_NEVER_WRITE.has(n.toLowerCase()));
    if (seeds.length)
      items.push({
        id: "core-seeds",
        kind: "config",
        icon: "⚙️",
        title: "Файлы настроек скриптов",
        recommended: true,
        summary: `Пустые «блокноты», куда скрипты складывают свои настройки (${seeds.length} шт.). Создадутся, только если их у тебя ещё нет.`,
        what: ["Уже существующие НЕ перезаписываются — то, что ты там настроил, останется.", "Файл с твоим личным ключом не трогается вообще никогда."],
        how: "Ничего делать не нужно. Если какой-то скрипт ругался «нет файла настроек» — перестанет.",
        affects: { seeds }
      });
    const css = names(manifest.css);
    if (css.length)
      items.push({
        id: "core-css",
        kind: "design",
        icon: "\u{1F3A8}",
        title: "Оформление (css-сниппеты)",
        recommended: true,
        summary: "Это красота: карточки, цвета и отступы на дашбордах и в подсказках. Без этого страницы выглядят «сырыми» — как голый текст.",
        what: [`Добавятся ${css.length} файла оформления и включатся в настройках Obsidian.`, "Твоё собственное оформление, если ты что-то добавлял, остаётся на месте."],
        how: "После установки перезапусти Obsidian — и увидишь разницу.",
        affects: { css }
      });
    if (manifest.theme && manifest.theme.name)
      items.push({
        id: "core-theme",
        kind: "design",
        icon: "\u{1F5BC}️",
        title: `Тема оформления ${manifest.theme.name}`,
        recommended: true,
        summary: "Общий «скин» всего Obsidian, под который рисовалась Система: шрифты, цвета, форма панелей.",
        what: [`Тема ${manifest.theme.name} установится и включится как активная.`, "Твоя текущая тема не удаляется — вернуть её можно в «Оформление» в два клика."],
        how: "После перезапуска Obsidian всё будет выглядеть как на скриншотах Системы.",
        why: "На другой теме отступы и цвета дашбордов могут разъезжаться — они нарисованы под эту.",
        affects: { theme: true }
      });
    if (manifest.moc && manifest.moc.content)
      items.push({
        id: "core-moc",
        kind: "note",
        icon: "\u{1F3E0}",
        title: "Домашняя страница (MOC - HOME)",
        recommended: true,
        summary: "Стартовая страница Системы — та, что открывается первой: разделы, кнопки, привычки, ссылки на всё остальное.",
        what: ["Твоя текущая домашняя страница будет заменена новой, а копия старой сохранится (её можно вернуть).", "Если ты её переименовал или перенёс — обновится именно она, второй такой же не появится."],
        how: "Открой её после перезапуска. Если на ней было что-то твоё личное — старая версия лежит в копиях.",
        why: "Отсюда всё запускается. Старая версия может вести на страницы и кнопки, которых уже нет.",
        affects: { moc: true }
      });
    if (manifest.cmdr && manifest.cmdr.content)
      items.push({
        id: "core-cmdr",
        kind: "design",
        icon: "\u{1F518}",
        title: "Кнопки на левой панели (Commander)",
        recommended: true,
        summary: "Полоска иконок слева для быстрого запуска: домашняя, входящие, поиск, ИИ и прочее — чтобы не искать команды руками.",
        what: ["Добавятся только те кнопки, которых у тебя нет.", "Твои собственные кнопки и их порядок никто не тронет."],
        how: "После перезапуска увидишь иконки слева. Лишние убираются в настройках плагина Commander.",
        affects: { cmdr: true }
      });
    const integrations = names(manifest.integrations);
    if (integrations.length)
      items.push({
        id: "core-integrations",
        kind: "script",
        icon: "\u{1F50C}",
        title: "Команды запуска (QuickAdd + кнопки)",
        recommended: true,
        summary: `То, чем скрипты вообще запускаются: ${integrations.length} команд и кнопок. Без них файл со скриптом просто лежит — нажать нечем.`,
        what: [`Появятся команды для: ${integrations.join(", ")}.`, "Добавляется только то, чего нет. Твои команды и кнопки остаются."],
        how: "Запускать можно с кнопки на странице «Кнопки» или из списка команд.",
        affects: { integrations }
      });
    const notesAll = names(manifest.notes);
    if (notesAll.length) {
      const upd = notesAll.filter((p) => manifest.notes[p] && manifest.notes[p].createOnly === false);
      const neo = notesAll.filter((p) => !(manifest.notes[p] && manifest.notes[p].createOnly === false));
      if (upd.length)
        items.push({
          id: "core-notes-update",
          kind: "note",
          icon: "\u{1F4DD}",
          title: "Шаблоны и служебные заметки Системы",
          recommended: true,
          summary: `${upd.length} страниц «каркаса»: заготовки заметок (ежедневная, книга, фильм, проект), инструкция, подсказки и страницы-дашборды.`,
          what: [
            "Твои личные заметки — дневник, книги, проекты — сюда НЕ входят и не меняются.",
            "Каждая такая страница заменяется новой версией, а копия старой сохраняется — можно вернуть.",
            "Если ты страницу переименовал или перенёс — обновится она же, дубля не появится."
          ],
          how: "Делать ничего не нужно. Если ты правил заготовки под себя — открой список ниже и реши сам.",
          why: "Заготовки и дашборды завязаны на скрипты: старые версии — это неработающие привычки, тренировки и фильтры.",
          affects: { notes: upd }
        });
      if (neo.length)
        items.push({
          id: "core-notes-new",
          kind: "new",
          icon: "➕",
          title: "Новые заметки Системы",
          recommended: true,
          summary: `${neo.length} страниц, которых у тебя может не быть: «Мечта», «Мои агенты», база упражнений и похожие — их ты потом наполняешь сам.`,
          what: ["Если такая страница уже есть — её вообще не трогают, твой текст в безопасности.", "Создаются только отсутствующие."],
          how: "После установки найдёшь их в соответствующих папках.",
          affects: { notes: neo }
        });
    }
    const pluginIds = names(manifest.plugins).filter((id) => manifest.plugins[id] && manifest.plugins[id].files && Object.keys(manifest.plugins[id].files).length);
    if (pluginIds.length)
      items.push({
        id: "core-plugins",
        kind: "plugin",
        icon: "\u{1F9F0}",
        title: `Плагины Системы (${pluginIds.length})`,
        recommended: true,
        summary: `Дополнения к Obsidian, на которых держится Система: ${pluginIds.join(", ")}. Ставятся и включаются сами — вручную качать ничего не надо.`,
        what: [
          "Файлы проверяются на целостность перед записью — битый плагин не установится.",
          "Личные данные плагинов (например твои книги в читалке) НЕ перезаписываются.",
          "Если плагин уже стоит — просто обновится до свежей версии."
        ],
        how: "После перезапуска Obsidian они активны. Любой можно отключить в «Сторонние плагины».",
        affects: { plugins: pluginIds }
      });
    const pcIds = names(manifest.pluginConfigs);
    if (pcIds.length)
      items.push({
        id: "core-plugin-configs",
        kind: "config",
        icon: "\u{1F527}",
        title: "Настройки плагинов под Систему",
        recommended: true,
        summary: "Проставит галочки в уже стоящих плагинах так, как надо Системе. Это самая частая причина «у меня всё стоит, но не работает».",
        what: [
          "Шаблоны (Templater): укажет папку заготовок — иначе в новых заметках остаётся непонятный код вместо текста.",
          "Команды (QuickAdd): добавит отсутствующие команды запуска, твои останутся.",
          "Защита страниц (note-locker): служебные страницы Системы защитятся от случайной правки.",
          "Домашняя страница: при запуске Obsidian будет открываться нужная заметка.",
          "Перед изменением настроек каждого плагина делается их копия."
        ],
        how: "Ничего делать не нужно, разница видна после перезапуска.",
        affects: { pluginConfigs: pcIds }
      });
    const removePlugins = Array.isArray(manifest.removePlugins) ? manifest.removePlugins : [];
    if (removePlugins.length)
      items.push({
        id: "core-remove-plugins",
        kind: "clean",
        icon: "\u{1F6AB}",
        title: "Отключить плагины, которые заменила Система",
        recommended: true,
        summary: `Раньше для этих функций нужны были отдельные плагины (${removePlugins.length} шт.) — теперь всё то же умеет один плагин Системы. Старые будут ВЫКЛЮЧЕНЫ, чтобы не было двойных кнопок и конфликтов.`,
        what: [
          "Выключены — значит НЕ удалены: файлы и данные остаются на месте.",
          "Кнопка «Вернуть всё назад» включает их обратно одним нажатием.",
          `Список: ${removePlugins.join(", ")}.`
        ],
        how: "Ничего делать не нужно. Если какой-то из них тебе всё же нужен — включи его в «Сторонние плагины».",
        affects: { removePlugins: true }
      });
    const obsolete = Array.isArray(manifest.obsoleteNotes) ? manifest.obsoleteNotes : [];
    if (obsolete.length)
      items.push({
        id: "core-obsolete",
        kind: "clean",
        icon: "\u{1F9F9}",
        title: "Убрать дубли старых дашбордов",
        recommended: true,
        summary: `В новой Системе ${obsolete.length} служебных страниц называются иначе. Если не убрать старые — у тебя будет по две похожих страницы, и непонятно, какая рабочая.`,
        what: [
          "Убираются ТОЛЬКО эти служебные страницы Системы и только если лежат ровно там, где лежали.",
          "Перед удалением каждая копируется в папку копий — вернуть можно всегда.",
          "Твои личные заметки в тех же папках не трогаются."
        ],
        how: "Ответишь НЕТ — ничего не удалится, просто в поиске будут попадаться два похожих дашборда.",
        affects: { obsolete: true }
      });
    const migrations = Array.isArray(manifest.migrations) ? manifest.migrations : [];
    if (migrations.length)
      items.push({
        id: "core-migrations",
        kind: "move",
        icon: "\u{1F4E6}",
        title: "Перенести переименованные папки",
        recommended: true,
        summary: `Часть папок в новой Системе называется иначе (${migrations.length} шт.). Твои файлы переедут в новые папки, и все ссылки на них поправятся автоматически.`,
        what: [
          ...migrations.slice(0, 6).map((m) => `${m.old} → ${m.neo}${m.move === false ? " (переносить не будем, поправим только ссылки)" : ""}`),
          "Если файл с таким именем в новом месте уже есть — он не перезаписывается.",
          "Заодно исправятся пути внутри настроек плагинов и скриптов, с сохранением копий."
        ],
        how: "Ничего делать не нужно. Старые папки останутся пустыми — их можно потом удалить руками.",
        why: "Иначе скрипты продолжат искать файлы по старым адресам и будут молча не находить их.",
        affects: { migrations: true }
      });
    return items;
  }
  /* Повторный показ мастера: «Что нового / изменить выбор» — в том числе чтобы
     поставить то, от чего раньше отказался. */
  async openWizard() {
    if (this.running)
      return;
    try {
      const { manifest, baseUrl, apiKey } = await this.fetchManifest();
      if (!await this.precheck(manifest))
        return;
      if (!await this.ensureScriptsFolderReady(true))
        return;
      const items = await this.changelogItems(manifest);
      if (!items.length) {
        new import_obsidian.Notice("Сервер не прислал ни одной части для этой версии.", 8e3);
        return;
      }
      new UpdateWizardModal(this.app, manifest, items, this.settings.declinedItems, async (accepted, declined) => {
        const sel = this.buildSelection(manifest, items, accepted, declined);
        await this.installCore(this.filterManifest(manifest, sel), baseUrl, apiKey, sel, items);
      }).open();
    } catch (e) {
      this.err(e);
    }
  }
  /* ЯДРО установки — прежний код «Установить ВСЁ» из 1.1.0.
     manifest здесь может быть УРЕЗАН под выбор подписчика. */
  async installCore(manifest, baseUrl, apiKey, sel, items) {
    this.running = true;
    try {
      await this.createRestorePoint(manifest);
      const created = await this.ensureSeeds(manifest);
      const changed = await this.diff(manifest);
      const r = changed.length ? await this.downloadAndRecord(baseUrl, apiKey, manifest, changed.map((c) => c.name)) : { done: [], failed: [], skipped: [] };
      const rep = await this.applyIntegrations(manifest);
      const extras = await this.applyExtrasReport(manifest);
      const eco = await this.ecosystemCore(manifest, baseUrl, apiKey);
      await this.markInstalled(manifest);
      if (sel)
        await this.rememberChoices(sel);
      // Мост со старого шаблона пройден: дальше подписчик получает актуальную
      // версию сервера, как все остальные.
      if ((manifest.resolvedVersion || "") === "v0" && !this.settings.bridgeDone) {
        this.settings.bridgeDone = true;
        await this.saveSettings();
      }
      let msg = "\u{1F680} Установка Obsimind\n";
      msg += `Скрипты: ${r.done.length ? r.done.join(", ") : "актуальны"}\n`;
      if (created.length)
        msg += `Настройки: ${created.join(", ")}\n`;
      msg += `QuickAdd: ${rep.qaAdded.length ? rep.qaAdded.join(", ") : "\u2014"} | Кнопки: ${rep.btnAdded.length ? rep.btnAdded.join(", ") : "\u2014"}\n`;
      msg += extras + "\n\u2014 \u2014 \u2014\n" + eco + "\n";
      if (sel && sel.declinedIds.length)
        msg += `\u23ED\uFE0F Пропущено по твоему выбору: ${sel.declinedIds.length}. Захочешь поставить позже — просто нажми «Начать» снова, эти пункты предложатся ещё раз.\n`;
      const errs = [...r.failed.map((f) => "файл " + f), ...rep.errors];
      if (errs.length)
        msg += `\u274C ${errs.join("; ")}\n`;
      msg += "\u267B\uFE0F Перезапусти Obsidian — и всё готово.";
      // Заметка-отчёт в хранилище подписчика: что обновилось, когда и что делать
      // дальше. Для тех, кто не читает уведомления и не разбирается в деталях.
      let notePath = "";
      try {
        notePath = await this.writeUpdateNote(manifest, sel, items, {
          scripts: r.done,
          seeds: created,
          qaAdded: rep.qaAdded,
          btnAdded: rep.btnAdded,
          extras,
          eco,
          errors: errs
        });
      } catch (e) {
        console.error("writeUpdateNote:", e);
      }
      if (notePath)
        msg += "\n\u{1F4C4} Что именно обновилось — в заметке «" + (notePath.split("/").pop() || "").replace(/\.md$/, "") + "», я её открыл.";
      new import_obsidian.Notice(msg, 2e4);
      if (notePath)
        await this.openNote(notePath);
    } catch (e) {
      this.err(e);
    } finally {
      this.running = false;
    }
  }
  /* ── ЗАМЕТКА «ЧТО ОБНОВИЛОСЬ» ─────────────────────────────────
     Пишется в хранилище подписчика после каждой установки: дата, версия,
     список того, что поставилось (человеческими названиями карточек), что
     пропущено, и что делать дальше. Один файл на день — повторные прогоны
     дописываются в него, чтобы не плодить заметки. */
  updateNoteFolder() {
    var _a, _b;
    // Список папок собираем из путей файлов — без API, которых может не быть
    // в старых версиях Obsidian.
    const dirs = /* @__PURE__ */ new Set();
    for (const f of this.app.vault.getFiles()) {
      const d = (_b = (_a = f.parent) == null ? void 0 : _a.path) != null ? _b : "";
      if (d && d !== "/")
        dirs.add(d);
    }
    // Порядок: Входящие/Inbox → папка домашней заметки → корень хранилища.
    const inbox = [...dirs].sort().find((p) => /(^|\/)(\d+\.\s*)?(inbox|входящие)$/i.test(p));
    if (inbox)
      return inbox;
    const moc = (this.settings.mocNote || "").split("/").slice(0, -1).join("/");
    if (moc && dirs.has(moc))
      return moc;
    return "";
  }
  async openNote(path) {
    try {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (file)
        await this.app.workspace.getLeaf(true).openFile(file);
      else
        await this.app.workspace.openLinkText(path, "", true);
    } catch (e) {
    }
  }
  async writeUpdateNote(manifest, sel, items, tech) {
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, "0");
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const yyyy = now.getFullYear();
    const time = now.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    const ver = manifest.resolvedVersion || "";
    const byId = /* @__PURE__ */ new Map();
    for (const it of items || [])
      byId.set(it.id, it);
    const accepted = ((sel == null ? void 0 : sel.acceptedIds) || []).map((id) => byId.get(id)).filter(Boolean);
    const declined = ((sel == null ? void 0 : sel.declinedIds) || []).map((id) => byId.get(id)).filter(Boolean);
    // head — только для новой заметки; L (секция) — то, что дописывается при
    // повторной установке в тот же день, без второго заголовка и вступления.
    const head = [
      "---",
      "tags:",
      "  - обновление/система",
      `Дата: ${yyyy}-${mm}-${dd}`,
      "---",
      "",
      `# ✅ Система обновлена — ${dd}.${mm}.${yyyy}`,
      "",
      "> [!tip] Что это за заметка",
      "> Её создал плагин **ObsiMind Upgrade** сразу после обновления, чтобы ты видел, что именно изменилось в твоём хранилище. Читать целиком не обязательно — самое важное в блоке «Что сделать сейчас». Заметку можно спокойно удалить, ничего не сломается.",
      ""
    ];
    const L = [];
    L.push(`**Когда:** ${dd}.${mm}.${yyyy}, ${time}${ver ? `  ·  **версия Системы:** ${ver}` : ""}`);
    L.push("");
    L.push("## 🔔 Что сделать сейчас");
    L.push("");
    L.push("1. **Закрой и открой Obsidian заново.** Без этого новые кнопки, оформление и плагины не подхватятся — это самая частая причина «у меня ничего не изменилось».");
    const emb = (tech.scripts || []).some((n) => /embeding|graph-linker/i.test(n));
    if (emb)
      L.push("2. Если поиск по смыслу или связи заметок начнут выдавать странное — **один раз запусти команду «Эмбединг»** и дай ей закончить. Она пересоберёт поисковую базу.");
    L.push(`${emb ? 3 : 2}. Если что-то не понравилось — **Настройки → ObsiMind Upgrade → «↩️ Вернуть всё назад»**. Вернётся то, что было до этого обновления.`);
    L.push("");
    if (accepted.length) {
      L.push("## 📦 Что обновилось");
      L.push("");
      for (const it of accepted) {
        L.push(`### ${it.icon ? it.icon + " " : ""}${it.title}`);
        if (it.summary)
          L.push(it.summary);
        if (it.how)
          L.push(`> [!note] Что делать тебе`);
        if (it.how)
          L.push(`> ${it.how}`);
        L.push("");
      }
    } else {
      L.push("## 📦 Что обновилось");
      L.push("");
      L.push("Файлы Системы приведены к свежей версии. Ничего нового ставить не потребовалось — значит, у тебя уже почти всё было актуально.");
      L.push("");
    }
    if (declined.length) {
      L.push("## ⏭️ Что ты пропустил");
      L.push("");
      L.push("Это НЕ ошибка: ты сам ответил «НЕТ», и эти части даже не скачивались — у тебя всё осталось как было.");
      L.push("");
      for (const it of declined)
        L.push(`- ${it.icon ? it.icon + " " : ""}**${it.title}**${it.summary ? " — " + it.summary : ""}`);
      L.push("");
      L.push("> [!info] Захочешь поставить позже");
      L.push("> Открой **Настройки → ObsiMind Upgrade** и нажми **«Начать»** ещё раз. Пропущенные пункты предложатся снова, с пометкой «раньше пропустил».");
      L.push("");
    }
    L.push("## 🧭 Куда смотреть после перезапуска");
    L.push("");
    L.push("- **Домашняя страница** — с неё всё начинается: разделы, кнопки, привычки.");
    L.push("- **Полоска иконок слева** — быстрый запуск: входящие, поиск, ИИ и остальное.");
    L.push("- **Страница «Кнопки»** — все команды Системы списком, если иконок не хватает.");
    L.push("- **Папка «Инструкция»** (если она у тебя есть) — подробное описание по шагам.");
    L.push("");
    const details = [];
    if ((tech.scripts || []).length)
      details.push(`- Обновлённые файлы (${tech.scripts.length}): ${tech.scripts.join(", ")}`);
    if ((tech.seeds || []).length)
      details.push(`- Созданы файлы настроек: ${tech.seeds.join(", ")}`);
    if ((tech.qaAdded || []).length)
      details.push(`- Новые команды запуска: ${tech.qaAdded.join(", ")}`);
    if ((tech.btnAdded || []).length)
      details.push(`- Новые кнопки: ${tech.btnAdded.join(", ")}`);
    // Отчёты applyExtrasReport/ecosystemCore многострочные, со своими маркерами —
    // приводим к одному виду списка.
    const lines = (s) => String(s || "").split("\n").map((x) => x.replace(/^[•\s]+/, "").trim()).filter(Boolean).map((x) => /:$/.test(x) ? x : "- " + x);
    if (tech.extras)
      details.push(...lines(tech.extras));
    if (tech.eco)
      details.push(...lines(tech.eco));
    if (details.length) {
      L.push("## 🔧 Подробности (можно не читать)");
      L.push("");
      L.push("> [!abstract]- Технический список изменений");
      for (const d of details)
        L.push("> " + d.replace(/\n/g, " "));
      L.push("");
    }
    if ((tech.errors || []).length) {
      L.push("> [!warning] Часть шагов не удалась");
      L.push("> " + tech.errors.join("; "));
      L.push("> Попробуй нажать «Начать» ещё раз: плагин доставит только то, что не доехало. Если повторится — напиши в поддержку и покажи эту заметку.");
      L.push("");
    }
    L.push("> [!success] Твои личные заметки не тронуты");
    L.push("> Обновление меняет только файлы самой Системы (скрипты, оформление, служебные страницы). Перед каждой перезаписью сохраняется копия старого файла, поэтому вернуть можно всё.");
    const section = L.join("\n");
    const folder = this.updateNoteFolder();
    const base = `Система обновлена — ${dd}.${mm}.${yyyy}.md`;
    const path = folder ? `${folder}/${base}` : base;
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing && existing instanceof import_obsidian.TFile) {
      const prev = await this.app.vault.read(existing);
      await this.app.vault.modify(existing, prev.replace(/\s*$/, "") + "\n\n---\n\n" + section + "\n");
      return path;
    }
    const full = head.join("\n") + section + "\n";
    try {
      await this.app.vault.create(path, full);
    } catch (e) {
      // Файл мог появиться на диске раньше, чем Obsidian увидел его в индексе.
      await this.app.vault.adapter.write(path, full);
    }
    return path;
  }
  /* Урезает манифест до выбранного. Невыбранное физически не скачается. */
  filterManifest(manifest, sel) {
    const pick = (obj, set) => {
      const out = {};
      for (const k of Object.keys(obj || {}))
        if (set.has(k))
          out[k] = obj[k];
      return out;
    };
    return Object.assign({}, manifest, {
      scripts: pick(manifest.scripts, sel.scripts),
      seeds: pick(manifest.seeds, sel.seeds),
      css: pick(manifest.css, sel.css),
      integrations: pick(manifest.integrations, sel.integrations),
      notes: pick(manifest.notes, sel.notes),
      plugins: pick(manifest.plugins, sel.plugins),
      pluginConfigs: pick(manifest.pluginConfigs, sel.pluginConfigs),
      moc: sel.moc ? manifest.moc : null,
      cmdr: sel.cmdr ? manifest.cmdr : null,
      theme: sel.theme ? manifest.theme : null,
      obsoleteNotes: sel.obsolete ? manifest.obsoleteNotes || [] : [],
      migrations: sel.migrations ? manifest.migrations || [] : [],
      removePlugins: sel.removePlugins ? manifest.removePlugins || [] : [],
      // Пустой removePlugins в манифесте означает «сервер не задал список» и
      // включает дефолтный набор. Этот флаг говорит «подписчик отказался» —
      // тогда не отключаем вообще ничего.
      noRemovePlugins: !sel.removePlugins
    });
  }
  /* Собирает выбор. Всё, что НЕ описано ни одной карточкой changelog, ставится
     всегда — это базис, без него выбранные пункты могут не завестись. */
  buildSelection(manifest, allItems, acceptedIds, declinedIds) {
    const KEYS = ["scripts", "seeds", "css", "integrations", "notes", "plugins", "pluginConfigs"];
    const FLAGS = ["moc", "cmdr", "theme", "obsolete", "migrations", "removePlugins"];
    const claimed = {}, claimedFlag = {};
    for (const k of KEYS)
      claimed[k] = /* @__PURE__ */ new Set();
    for (const f of FLAGS)
      claimedFlag[f] = false;
    for (const it of allItems) {
      const a = it.affects || {};
      for (const k of KEYS)
        (a[k] || []).forEach((x) => claimed[k].add(x));
      for (const f of FLAGS)
        if (a[f])
          claimedFlag[f] = true;
    }
    const sel = { acceptedIds: [...acceptedIds], declinedIds: [...declinedIds] };
    for (const k of KEYS)
      sel[k] = /* @__PURE__ */ new Set();
    for (const f of FLAGS)
      sel[f] = false;
    const accepted = new Set(acceptedIds);
    for (const it of allItems) {
      if (!accepted.has(it.id))
        continue;
      const a = it.affects || {};
      for (const k of KEYS)
        (a[k] || []).forEach((x) => sel[k].add(x));
      for (const f of FLAGS)
        if (a[f])
          sel[f] = true;
    }
    const SRC = {
      scripts: manifest.scripts,
      seeds: manifest.seeds,
      css: manifest.css,
      integrations: manifest.integrations,
      notes: manifest.notes,
      plugins: manifest.plugins,
      pluginConfigs: manifest.pluginConfigs
    };
    for (const k of KEYS)
      for (const n of Object.keys(SRC[k] || {}))
        if (!claimed[k].has(n))
          sel[k].add(n);
    const HAS = {
      moc: !!manifest.moc,
      cmdr: !!manifest.cmdr,
      theme: !!(manifest.theme && manifest.theme.name),
      obsolete: !!(manifest.obsoleteNotes || []).length,
      migrations: !!(manifest.migrations || []).length,
      removePlugins: !!(manifest.removePlugins || []).length
    };
    for (const f of FLAGS)
      if (!claimedFlag[f] && HAS[f])
        sel[f] = true;
    return sel;
  }
  /* Какие карточки ещё НЕ применены (по хэшам/наличию файлов). */
  async pendingItems(manifest, items) {
    const out = [];
    for (const it of items)
      if (await this.itemPending(manifest, it))
        out.push(it);
    return out;
  }
  async itemPending(manifest, item) {
    const adapter = this.app.vault.adapter;
    const a = item.affects || {};
    const folder = this.folder();
    for (const name of a.scripts || []) {
      const meta = (manifest.scripts || {})[name];
      if (!meta)
        continue;
      const p = `${folder}/${name}`;
      if (!await adapter.exists(p))
        return true;
      try {
        if (await sha256Hex(await adapter.readBinary(p)) !== meta.sha256)
          return true;
      } catch (e) {
        return true;
      }
    }
    for (const name of a.seeds || []) {
      if (!(manifest.seeds || {})[name])
        continue;
      if (!await adapter.exists(`${folder}/${name}`))
        return true;
    }
    for (const name of a.css || []) {
      const meta = (manifest.css || {})[name];
      if (!meta)
        continue;
      const p = `${this.app.vault.configDir}/snippets/${name}`;
      if (!await adapter.exists(p))
        return true;
      try {
        if (await sha256Hex(await adapter.readBinary(p)) !== meta.sha256)
          return true;
      } catch (e) {
        return true;
      }
    }
    for (const np of a.notes || []) {
      const meta = (manifest.notes || {})[np];
      if (!meta)
        continue;
      let target = await adapter.exists(np) ? np : null;
      if (!target) {
        const base = np.split("/").pop() || "";
        const hit = this.app.vault.getMarkdownFiles().find((f) => f.name === base);
        target = hit ? hit.path : null;
      }
      if (!target)
        return true;
      if (meta.createOnly === false) {
        try {
          if (await sha256Hex(await adapter.readBinary(target)) !== meta.sha256)
            return true;
        } catch (e) {
          return true;
        }
      }
    }
    if (a.moc && manifest.moc && manifest.moc.content) {
      const p = await this.resolveNotePath("mocNote");
      if (!await adapter.exists(p))
        return true;
      try {
        if (await sha256Hex(await adapter.readBinary(p)) !== manifest.moc.sha256)
          return true;
      } catch (e) {
        return true;
      }
    }
    if (a.cmdr && manifest.cmdr && manifest.cmdr.content) {
      if (await this.cmdrHasNew(manifest))
        return true;
    }
    for (const key of a.integrations || []) {
      if (await this.integrationMissing(manifest, key))
        return true;
    }
    if (a.theme && manifest.theme && manifest.theme.name) {
      const dir = `${this.app.vault.configDir}/themes/${manifest.theme.name}`;
      for (const [name, meta] of Object.entries(manifest.theme.files || {})) {
        const p = `${dir}/${name}`;
        if (!await adapter.exists(p))
          return true;
        try {
          if (await sha256Hex(await adapter.readBinary(p)) !== meta.sha256)
            return true;
        } catch (e) {
          return true;
        }
      }
      try {
        const conf = JSON.parse(await adapter.read(`${this.app.vault.configDir}/appearance.json`));
        if (conf.cssTheme !== manifest.theme.name)
          return true;
      } catch (e) {
        return true;
      }
    }
    // Удаление дублей / переносы / отключение плагинов: «есть работа» = объект ещё на месте.
    if (a.obsolete) {
      for (const rel of manifest.obsoleteNotes || [])
        if (await adapter.exists(rel))
          return true;
    }
    if (a.migrations) {
      for (const m of manifest.migrations || [])
        if (m && m.old && m.move !== false && await adapter.exists(m.old))
          return true;
    }
    if (a.removePlugins) {
      const plugins = this.pluginsApi();
      const list = Array.isArray(manifest.removePlugins) && manifest.removePlugins.length ? manifest.removePlugins : DEFAULT_REMOVE_PLUGINS;
      for (const id of list)
        if (plugins && plugins.enabledPlugins && plugins.enabledPlugins.has(id))
          return true;
    }
    // Мерж настроек плагинов по хэшу не проверить (мы дописываем в чужой data.json),
    // поэтому считаем применённым только то, что подписчик уже принимал.
    for (const id of a.pluginConfigs || []) {
      if (!(manifest.pluginConfigs || {})[id])
        continue;
      if (!(this.settings.installedItems || []).includes(item.id))
        return true;
    }
    for (const id of a.plugins || []) {
      const spec = (manifest.plugins || {})[id];
      if (!spec || !spec.files)
        continue;
      const dir = `${this.app.vault.configDir}/plugins/${id}`;
      for (const [name, meta] of Object.entries(spec.files)) {
        if (!isWritablePluginFile(name))
          continue;
        if (name.toLowerCase() === "data.json")
          continue;
        const p = `${dir}/${name}`;
        if (!await adapter.exists(p))
          return true;
        try {
          if (await sha256Hex(await adapter.readBinary(p)) !== meta.sha256)
            return true;
        } catch (e) {
          return true;
        }
      }
    }
    return false;
  }
  /* Есть ли у сервера кнопки Commander, которых нет локально. */
  async cmdrHasNew(manifest) {
    const adapter = this.app.vault.adapter;
    const p = `${this.app.vault.configDir}/plugins/cmdr/data.json`;
    if (!await adapter.exists(p))
      return true;
    try {
      const server = JSON.parse((manifest.cmdr && manifest.cmdr.content) || "{}");
      const local = JSON.parse(await adapter.read(p));
      const arrays = ["leftRibbon", "rightRibbon", "editorMenu", "fileMenu", "titleBar", "statusBar", "pageHeader", "explorer", "macros"];
      for (const key of arrays) {
        const sArr = server[key];
        if (!Array.isArray(sArr))
          continue;
        const ids = new Set((Array.isArray(local[key]) ? local[key] : []).map((x) => x && x.id));
        if (sArr.some((x) => x && x.id && !ids.has(x.id)))
          return true;
      }
    } catch (e) {
      return true;
    }
    return false;
  }
  /* Не хватает ли пункта QuickAdd или кнопки для интеграции. */
  async integrationMissing(manifest, key) {
    const integ = (manifest.integrations || {})[key];
    if (!integ)
      return false;
    const adapter = this.app.vault.adapter;
    if (integ.quickadd && integ.quickadd.id) {
      try {
        const data = JSON.parse(await adapter.read(`${this.app.vault.configDir}/plugins/quickadd/data.json`));
        const ids = new Set((data.choices || []).map((c) => c && c.id));
        if (!ids.has(integ.quickadd.id))
          return true;
      } catch (e) {
        return true;
      }
    }
    if (integ.button && integ.button.ref) {
      try {
        const notePath = await this.resolveNotePath("buttonsNote");
        const content = await adapter.read(notePath);
        if (!content.includes(`^${integ.button.ref}`))
          return true;
      } catch (e) {
        return true;
      }
    }
    return false;
  }
  /* Запоминаем решения: принятое не спрашиваем снова, отклонённое — предлагаем,
     но по умолчанию «НЕТ». */
  async rememberChoices(sel) {
    const inst = new Set(this.settings.installedItems || []);
    const dec = new Set(this.settings.declinedItems || []);
    for (const id of sel.acceptedIds) {
      inst.add(id);
      dec.delete(id);
    }
    for (const id of sel.declinedIds)
      dec.add(id);
    this.settings.installedItems = [...inst];
    this.settings.declinedItems = [...dec];
    await this.saveSettings();
  }
  /* ── Скачивание + бэкап + запись в историю ───────────────────
     Пишем ТОЛЬКО .js (isWritableScript). Старую версию кладём в
     .obsimind-bak/<имя>.<метка>.bak и записываем сессию для отката. */
  async downloadAndRecord(baseUrl, apiKey, manifest, names) {
    const adapter = this.app.vault.adapter;
    const folder = this.folder();
    const bakDir = `${folder}/${BAK_DIR}`;
    const done = [], failed = [], skipped = [];
    if (!names.length)
      return { done, failed, skipped };
    await this.ensureFolder(folder);
    if (this.settings.makeBak)
      await this.ensureFolder(bakDir);
    const session = { time: Date.now(), items: [] };
    for (const name of names) {
      if (!isWritableScript(name)) {
        skipped.push(name);
        continue;
      }
      const meta = manifest.scripts[name];
      if (!meta) {
        skipped.push(name);
        continue;
      }
      try {
        const res = await (0, import_obsidian.requestUrl)({
          url: `${baseUrl}/scripts/${encodeURIComponent(name)}${this.verParam(manifest)}`,
          method: "GET",
          headers: { Authorization: `Bearer ${apiKey}` },
          throw: false
        });
        if (res.status !== 200)
          throw new Error(`HTTP ${res.status}`);
        const buf = res.arrayBuffer;
        if (await sha256Hex(buf) !== meta.sha256)
          throw new Error("\u0445\u044D\u0448 \u043D\u0435 \u0441\u043E\u0432\u043F\u0430\u043B, \u043F\u0440\u043E\u043F\u0443\u0441\u043A");
        const p = `${folder}/${name}`;
        let fromHash = null;
        let backupPath = "";
        if (await adapter.exists(p)) {
          const old = await adapter.readBinary(p);
          fromHash = await sha256Hex(old);
          if (this.settings.makeBak) {
            backupPath = `${bakDir}/${name}.${session.time}.bak`;
            await adapter.writeBinary(backupPath, old);
          }
        }
        await adapter.writeBinary(p, buf);
        session.items.push({ name, backupPath, fromHash, toHash: meta.sha256 });
        done.push(name);
      } catch (e) {
        failed.push(`${name} (${e instanceof Error ? e.message : String(e)})`);
      }
    }
    if (session.items.length) {
      this.settings.history = [...this.settings.history, session].slice(-MAX_SESSIONS);
      await this.saveSettings();
      await this.pruneBackups();
    }
    return { done, failed, skipped };
  }
  /* Чистим старые бэкапы: на каждый файл оставляем последние MAX_BAK_PER_FILE. */
  async pruneBackups() {
    var _a;
    const adapter = this.app.vault.adapter;
    const bakDir = `${this.folder()}/${BAK_DIR}`;
    try {
      if (!await adapter.exists(bakDir))
        return;
      const listed = await adapter.list(bakDir);
      const byName = {};
      for (const fp of listed.files) {
        const base = fp.split("/").pop() || "";
        const m = base.match(/^(.*\.js)\.(\d+)\.bak$/);
        if (!m)
          continue;
        (byName[_a = m[1]] || (byName[_a] = [])).push(fp);
      }
      for (const n in byName) {
        const arr = byName[n].sort();
        const excess = arr.slice(0, Math.max(0, arr.length - MAX_BAK_PER_FILE));
        for (const fp of excess) {
          try {
            await adapter.remove(fp);
          } catch (e) {
          }
        }
      }
    } catch (e) {
    }
  }
  /* Откат конкретной сессии: восстанавливаем файлы из бэкапов.
     Файлы, которые были новыми (бэкапа нет), НЕ удаляем — только сообщаем. */
  async rollbackSession(session) {
    const adapter = this.app.vault.adapter;
    const folder = this.folder();
    const restored = [], skipped = [], failed = [];
    for (const it of session.items) {
      if (!isWritableScript(it.name)) {
        skipped.push(it.name);
        continue;
      }
      const p = `${folder}/${it.name}`;
      if (!it.backupPath) {
        skipped.push(it.name + " (\u0431\u044B\u043B \u043D\u043E\u0432\u044B\u043C)");
        continue;
      }
      try {
        if (!await adapter.exists(it.backupPath)) {
          failed.push(it.name + " (\u0431\u044D\u043A\u0430\u043F \u0443\u0434\u0430\u043B\u0451\u043D)");
          continue;
        }
        await adapter.writeBinary(p, await adapter.readBinary(it.backupPath));
        restored.push(it.name);
      } catch (e) {
        failed.push(it.name);
      }
    }
    this.settings.history = this.settings.history.filter((s) => s !== session);
    await this.saveSettings();
    let msg = "";
    if (restored.length)
      msg += "\u21A9\uFE0F \u041E\u0442\u043A\u0430\u0442\u0430\u043D\u043E: " + restored.join(", ") + "\n\u267B\uFE0F \u041F\u0435\u0440\u0435\u0437\u0430\u043F\u0443\u0441\u0442\u0438 Obsidian.";
    if (skipped.length)
      msg += (msg ? "\n" : "") + "\u041F\u0440\u043E\u043F\u0443\u0449\u0435\u043D\u043E: " + skipped.join(", ");
    if (failed.length)
      msg += (msg ? "\n" : "") + "\u274C " + failed.join(", ");
    new import_obsidian.Notice(msg || "\u041D\u0435\u0447\u0435\u0433\u043E \u043E\u0442\u043A\u0430\u0442\u044B\u0432\u0430\u0442\u044C", 12e3);
  }
  /* Аддитивно: добавляет только отсутствующее. Чужие настройки не трогает. */
  async applyIntegrations(manifest) {
    var _a, _b;
    const adapter = this.app.vault.adapter;
    const qaAdded = [], btnAdded = [], errors = [];
    let qaReloaded = false;
    const integrations = manifest.integrations || {};
    if (!Object.keys(integrations).length)
      return { qaAdded, btnAdded, qaReloaded, errors };
    const qaPath = `${this.app.vault.configDir}/plugins/quickadd/data.json`;
    try {
      if (!await adapter.exists(qaPath))
        throw new Error("QuickAdd data.json \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D");
      const raw = await adapter.read(qaPath);
      const data = JSON.parse(raw);
      if (!Array.isArray(data.choices))
        throw new Error("\u043D\u0435\u043E\u0436\u0438\u0434\u0430\u043D\u043D\u0430\u044F \u0441\u0445\u0435\u043C\u0430 data.json");
      const existingIds = new Set(data.choices.map((c) => c.id));
      let changed = false;
      for (const [script, integ] of Object.entries(integrations)) {
        const qa = integ.quickadd;
        if (!qa || !qa.id)
          continue;
        if (!existingIds.has(qa.id)) {
          data.choices.push(qa);
          existingIds.add(qa.id);
          qaAdded.push(qa.name || script);
          changed = true;
        }
      }
      if (changed) {
        const out = JSON.stringify(data, null, 2);
        await adapter.write(`${qaPath}.obsimind.bak`, raw);
        if (this.settings.autoReloadQuickadd) {
          const plugins = this.app.plugins;
          if (((_a = plugins == null ? void 0 : plugins.enabledPlugins) == null ? void 0 : _a.has("quickadd")) && plugins.disablePlugin && plugins.enablePlugin) {
            await plugins.disablePlugin("quickadd");
            await adapter.write(qaPath, out);
            await plugins.enablePlugin("quickadd");
            qaReloaded = true;
          }
        }
        if (!qaReloaded)
          await adapter.write(qaPath, out);
      }
    } catch (e) {
      errors.push(`QuickAdd: ${e instanceof Error ? e.message : String(e)}`);
    }
    try {
      const notePath = await this.resolveNotePath("buttonsNote");
      if (!await adapter.exists(notePath)) {
        const dir = notePath.split("/").slice(0, -1).join("/");
        if (dir)
          await this.ensureFolder(dir);
        await adapter.write(notePath, "# MOC - Buttons - \u041A\u043D\u043E\u043F\u043A\u0438\n");
      }
      let content = await adapter.read(notePath);
      let changed = false;
      let backupDone = false;
      for (const [script, integ] of Object.entries(integrations)) {
        const btn = integ.button;
        if (!btn || !btn.ref || !btn.block)
          continue;
        const anchor = `^${btn.ref}`;
        if (content.includes(anchor))
          continue;
        if (!backupDone) {
          await adapter.write(`${notePath}.obsimind.bak`, content);
          backupDone = true;
        }
        content = content.replace(/\s*$/, "") + `

${btn.block}
${anchor}
`;
        btnAdded.push((((_b = btn.block.match(/name\s+(.+)/)) == null ? void 0 : _b[1]) || script).trim());
        changed = true;
      }
      if (changed)
        await adapter.write(notePath, content);
    } catch (e) {
      errors.push(`\u041A\u043D\u043E\u043F\u043A\u0438: ${e instanceof Error ? e.message : String(e)}`);
    }
    return { qaAdded, btnAdded, qaReloaded, errors };
  }
  /* ── css-сниппеты: пишем в .obsidian/snippets/ и включаем. Обновляем только
     изменившиеся (по хэшу), старую версию кладём в .obsimind-bak. ─────────── */
  async applyCss(manifest) {
    var _a, _b;
    const adapter = this.app.vault.adapter;
    const css = manifest.css || {};
    const names = Object.keys(css);
    const written = [], failed = [];
    if (!names.length)
      return { written, failed };
    const dir = `${this.app.vault.configDir}/snippets`;
    await this.ensureFolder(dir);
    for (const name of names) {
      if (name.includes("/") || name.includes("\\") || !name.toLowerCase().endsWith(".css")) {
        failed.push(name + " (\u0438\u043C\u044F)");
        continue;
      }
      const meta = css[name];
      const p = `${dir}/${name}`;
      try {
        let local = null;
        if (await adapter.exists(p)) {
          try {
            local = await sha256Hex(await adapter.readBinary(p));
          } catch (e) {
          }
        }
        if (local === meta.sha256)
          continue;
        if (local !== null && this.settings.makeBak) {
          const bakDir = `${this.folder()}/${BAK_DIR}`;
          await this.ensureFolder(bakDir);
          await adapter.write(`${bakDir}/${name}.${Date.now()}.bak`, await adapter.read(p));
        }
        await adapter.write(p, meta.content);
        written.push(name);
      } catch (e) {
        failed.push(`${name} (${e instanceof Error ? e.message : String(e)})`);
      }
    }
    try {
      const cc = this.app.customCss;
      (_a = cc == null ? void 0 : cc.requestLoadSnippets) == null ? void 0 : _a.call(cc);
      for (const name of names) {
        try {
          (_b = cc == null ? void 0 : cc.setCssEnabledStatus) == null ? void 0 : _b.call(cc, name.replace(/\.css$/i, ""), true);
        } catch (e) {
        }
      }
    } catch (e) {
    }
    return { written, failed };
  }
  /* ── MOC — домашняя заметка. Пишем по пути из настроек, бэкап при наличии. ── */
  async applyMoc(manifest) {
    const moc = manifest.moc;
    if (!moc || !moc.content)
      return "";
    const adapter = this.app.vault.adapter;
    const p = await this.resolveNotePath("mocNote");
    if (!p)
      return "";
    const dir = p.split("/").slice(0, -1).join("/");
    if (dir)
      await this.ensureFolder(dir);
    let local = null;
    if (await adapter.exists(p)) {
      try {
        local = await sha256Hex(await adapter.readBinary(p));
      } catch (e) {
      }
    }
    if (local === moc.sha256)
      return "";
    if (local !== null && this.settings.makeBak) {
      const bakDir = `${this.folder()}/${BAK_DIR}`;
      await this.ensureFolder(bakDir);
      await adapter.write(`${bakDir}/MOC-HOME.${Date.now()}.bak`, await adapter.read(p));
    }
    await adapter.write(p, moc.content);
    return p;
  }
  /* ── Commander: АДДИТИВНОЕ слияние data.json. Личные кнопки подписчика (его
     id в leftRibbon и пр.) НИКОГДА не удаляются и не перезаписываются — добавляем
     только отсутствующие записи по id. Нет локального файла → пишем целиком. ── */
  async applyCmdr(manifest) {
    const cmdr = manifest.cmdr;
    if (!cmdr || !cmdr.content)
      return { added: 0, status: "\u043D\u0435\u0442 \u0434\u0430\u043D\u043D\u044B\u0445" };
    const adapter = this.app.vault.adapter;
    const p = `${this.app.vault.configDir}/plugins/cmdr/data.json`;
    let server;
    try {
      server = JSON.parse(cmdr.content);
    } catch (e) {
      throw new Error("\u0441\u0435\u0440\u0432\u0435\u0440 \u0432\u0435\u0440\u043D\u0443\u043B \u0431\u0438\u0442\u044B\u0439 JSON");
    }
    if (!await adapter.exists(p)) {
      await this.ensureFolder(`${this.app.vault.configDir}/plugins/cmdr`);
      await adapter.write(p, JSON.stringify(server, null, 2));
      return { added: -1, status: "\u0441\u043E\u0437\u0434\u0430\u043D" };
    }
    const raw = await adapter.read(p);
    let local;
    try {
      local = JSON.parse(raw);
    } catch (e) {
      throw new Error("\u043B\u043E\u043A\u0430\u043B\u044C\u043D\u044B\u0439 data.json \u0431\u0438\u0442\u044B\u0439");
    }
    const arrays = ["leftRibbon", "rightRibbon", "editorMenu", "fileMenu", "titleBar", "statusBar", "pageHeader", "explorer", "macros"];
    let added = 0;
    for (const key of arrays) {
      const sArr = server[key];
      if (!Array.isArray(sArr))
        continue;
      if (!Array.isArray(local[key]))
        local[key] = [];
      const lArr = local[key];
      const ids = new Set(lArr.map((x) => x && x.id));
      for (const item of sArr) {
        if (item && item.id && !ids.has(item.id)) {
          lArr.push(item);
          ids.add(item.id);
          added++;
        }
      }
    }
    if (!added)
      return { added: 0, status: "\u0430\u043A\u0442\u0443\u0430\u043B\u044C\u043D\u043E" };
    if (this.settings.makeBak)
      await adapter.write(`${p}.obsimind.bak`, raw);
    await adapter.write(p, JSON.stringify(local, null, 2));
    return { added, status: "\u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u043E" };
  }
  /* \u041D\u0430\u0445\u043E\u0434\u0438\u0442 \u0440\u0435\u0430\u043B\u044C\u043D\u044B\u0439 \u043F\u0443\u0442\u044C \u0437\u0430\u043C\u0435\u0442\u043A\u0438 \u043F\u043E basename \u2014 \u0434\u043B\u044F \u0440\u0435\u043C\u0430\u043F\u0430 \u043F\u0443\u0442\u0435\u0439 \u0432 \u043A\u043E\u043D\u0444\u0438\u0433\u0430\u0445, \u0435\u0441\u043B\u0438 \u0443
     \u043F\u043E\u0434\u043F\u0438\u0441\u0447\u0438\u043A\u0430 \u0441\u0442\u0430\u0440\u0430\u044F \u0441\u0442\u0440\u0443\u043A\u0442\u0443\u0440\u0430 \u043F\u0430\u043F\u043E\u043A. p \u043C\u043E\u0436\u0435\u0442 \u0431\u044B\u0442\u044C \u0431\u0435\u0437 \u0440\u0430\u0441\u0448\u0438\u0440\u0435\u043D\u0438\u044F. */
  findActualNotePath(p) {
    if (!p)
      return p;
    const withExt = /\.\w+$/.test(p) ? p : p + ".md";
    if (this.app.vault.getAbstractFileByPath(withExt))
      return p;
    const base = withExt.split("/").pop();
    const lc = (base || "").toLowerCase();
    const all = this.app.vault.getFiles();
    const hit = all.find((f) => f.name === base) || all.find((f) => f.name.toLowerCase() === lc);
    if (!hit)
      return p;
    return /\.\w+$/.test(p) ? hit.path : hit.path.replace(/\.md$/i, "");
  }
  /* \u0410\u0434\u0434\u0438\u0442\u0438\u0432\u043D\u044B\u0439 merge \u043A\u043E\u043D\u0444\u0438\u0433\u043E\u0432 \u043F\u043B\u0430\u0433\u0438\u043D\u043E\u0432 \u0438\u0437 manifest.pluginConfigs:
     templater (\u043F\u0430\u043F\u043A\u0430 \u0448\u0430\u0431\u043B\u043E\u043D\u043E\u0432 \u2192 \u0447\u0438\u043D\u0438\u0442 \u0441\u044B\u0440\u043E\u0439 <% %>), quickadd (\u043A\u043D\u043E\u043F\u043A\u0438 \u0441\u043A\u0440\u0438\u043F\u0442\u043E\u0432 \u043F\u043E id),
     note-locker (\u043B\u043E\u043A\u0438 \u0441 \u0440\u0435\u043C\u0430\u043F\u043E\u043C \u043F\u0443\u0442\u0435\u0439), homepage (\u043F\u0443\u0442\u044C HOME). \u041B\u0438\u0447\u043D\u043E\u0435 \u0441\u043E\u0445\u0440\u0430\u043D\u044F\u0435\u0442\u0441\u044F,
     \u043F\u0435\u0440\u0435\u0434 \u0437\u0430\u043F\u0438\u0441\u044C\u044E \u2014 \u0431\u044D\u043A\u0430\u043F *.obsimind.bak. */
  async applyPluginConfigs(manifest) {
    const cfgs = manifest.pluginConfigs || {};
    const adapter = this.app.vault.adapter;
    const changed = [];
    for (const id of Object.keys(cfgs)) {
      let server;
      try {
        server = JSON.parse(cfgs[id].content);
      } catch (e) {
        continue;
      }
      const p = `${this.app.vault.configDir}/plugins/${id}/data.json`;
      let user = {};
      const existed = await adapter.exists(p);
      if (existed) {
        try {
          user = JSON.parse(await adapter.read(p));
        } catch (e) {
          user = {};
        }
      }
      const before = existed ? JSON.stringify(user, null, 2) : null;
      let merged = null;
      if (id === "templater-obsidian") {
        merged = Object.assign({}, user);
        for (const k of ["templates_folder", "trigger_on_file_creation", "auto_jump_to_cursor", "enable_folder_templates", "command_timeout", "syntax_highlighting"])
          if (server[k] !== void 0)
            merged[k] = server[k];
      } else if (id === "note-locker") {
        const uniq = (a, b) => Array.from(/* @__PURE__ */ new Set([...Array.isArray(a) ? a : [], ...Array.isArray(b) ? b : []]));
        merged = Object.assign({}, user);
        const remapped = (Array.isArray(server.lockedNotes) ? server.lockedNotes : []).map((np) => this.findActualNotePath(np));
        merged.lockedNotes = uniq(user.lockedNotes, remapped);
        merged.lockedFolders = uniq(user.lockedFolders, server.lockedFolders);
        merged.strictLockedNotes = uniq(user.strictLockedNotes, server.strictLockedNotes);
        for (const k of ["preventEditInLockedNotes", "showFileExplorerIcons", "showStatusBarButton", "showNotifications", "mobileNotificationMaxLength", "desktopNotificationMaxLength"])
          if (server[k] !== void 0)
            merged[k] = server[k];
      } else if (id === "quickadd") {
        merged = Object.assign({}, user);
        const serverChoices = Array.isArray(server.choices) ? server.choices : [];
        const serverIds = new Set(serverChoices.map((c) => c && c.id).filter(Boolean));
        const serverNames = new Set(serverChoices.map((c) => c && c.name).filter(Boolean));
        // Принудительное отключение устаревших команд (manifest.obsoleteChoiceIds)
        // по id — для тех, у кого сервер БОЛЬШЕ не раздаёт это имя (дедуп по имени
        // их не ловит): напр. удалённая «New mermaid» или старый Macro «Создать
        // рисунок», заменённый Multi-списком. Снимает «зависшие» дубли у уже
        // синхронизированных подписчиков.
        const obsoleteIds = new Set(Array.isArray(manifest.obsoleteChoiceIds) ? manifest.obsoleteChoiceIds : []);
        // Дедуп «теневых» дублей: выкидываем пользовательскую команду, чьё имя
        // вводит сервер (серверная — каноническая), но id другой (старая версия
        // из прежнего шаблона). Кнопки резолвят QuickAdd ПО ИМЕНИ → дубль
        // «затеняет» новую команду и открывает не то. Каноническая победит.
        const choices = (Array.isArray(user.choices) ? user.choices : []).filter((c) => {
          if (!c)
            return false;
          if (obsoleteIds.has(c.id))
            return false;
          if (c.name && serverNames.has(c.name) && !serverIds.has(c.id))
            return false;
          return true;
        });
        const ids = new Set(choices.map((c) => c && c.id));
        for (const c of serverChoices)
          if (c && c.id && !ids.has(c.id)) {
            choices.push(c);
            ids.add(c.id);
          }
        merged.choices = choices;
        if (Array.isArray(server.macros) && server.macros.length) {
          const mac = Array.isArray(user.macros) ? user.macros.slice() : [];
          const mids = new Set(mac.map((x) => x && x.id));
          for (const x of server.macros)
            if (x && x.id && !mids.has(x.id)) {
              mac.push(x);
              mids.add(x.id);
            }
          merged.macros = mac;
        }
      } else if (id === "homepage") {
        const clone = JSON.parse(JSON.stringify(user || {}));
        const serverVal = server.homepages && server.homepages["Main Homepage"] && server.homepages["Main Homepage"].value || "";
        const target = this.findActualNotePath(serverVal || "");
        if (clone.homepages && typeof clone.homepages === "object") {
          for (const key of Object.keys(clone.homepages))
            if (clone.homepages[key] && target)
              clone.homepages[key].value = target;
        } else if (server.homepages) {
          clone.homepages = server.homepages;
        }
        merged = clone;
      } else {
        continue;
      }
      try {
        const out = JSON.stringify(merged, null, 2);
        if (out === before)
          continue;
        await this.ensureFolder(`${this.app.vault.configDir}/plugins/${id}`);
        if (existed && this.settings.makeBak)
          await adapter.write(`${p}.obsimind.bak`, await adapter.read(p));
        await adapter.write(p, out);
        changed.push(id);
      } catch (e) {
      }
    }
    return changed;
  }
  /* Удаляет старые ПЕРЕИМЕНОВАННЫЕ системные дашборды (manifest.obsoleteNotes), чтобы не
     было дублей. Бэкап в .obsimind-bak/obsolete перед удалением. Удаляет ТОЛЬКО если файл
     лежит ровно по этому пути (если подписчик перенёс — пропускаем). Откат восстанавливает. */
  async applyObsoleteNotes(manifest) {
    const list = Array.isArray(manifest.obsoleteNotes) ? manifest.obsoleteNotes : [];
    if (!list.length)
      return [];
    const adapter = this.app.vault.adapter;
    const removed = [];
    const bakDir = `${this.folder()}/${BAK_DIR}/obsolete`;
    for (const rel of list) {
      try {
        if (!rel || rel.includes("..") || rel.startsWith("/"))
          continue;
        if (!await adapter.exists(rel))
          continue;
        if (this.settings.makeBak) {
          await this.ensureFolder(bakDir);
          const base = rel.split("/").pop();
          await adapter.writeBinary(`${bakDir}/${base}.${Date.now()}.bak`, await adapter.readBinary(rel));
        }
        await adapter.remove(rel);
        removed.push(rel.split("/").pop());
      } catch (e) {
      }
    }
    return removed;
  }
  /* ── Миграция переименованных папок/заметок (manifest.migrations) ──────────
     Каждая пара: { old, neo, move? }. При апгрейде между версиями шаблона
     (например «2. Areas/Сериалы и фильмы/База…» → «2. Areas/Кино/База») плагин:
       1) физически переносит файлы подписчика old→neo (move !== false),
       2) переписывает ВСЕ ссылки на старый путь в data.json плагинов (QuickAdd,
          unofficial-kinopoisk, note-locker…), core-конфигах (daily-notes,
          templates) и в .js/.json скриптах — чтобы кнопки/скрипты заработали
          без ручной правки.
     Идемпотентно (уже перенесённое/исправленное пропускается → безопасно на
     каждом sync). Если manifest.migrations нет (другая версия шаблона) — no-op.
     Старые папки НЕ удаляются (после переноса остаётся пустая папка). */
  async applyMigrations(manifest) {
    const list = Array.isArray(manifest.migrations) ? manifest.migrations : [];
    if (!list.length)
      return { moved: 0, files: 0 };
    const adapter = this.app.vault.adapter;
    const pairs = [];
    for (const m of list) {
      if (!m || typeof m.old !== "string" || typeof m.neo !== "string")
        continue;
      const o = m.old.replace(/\/+$/, "").trim();
      const n = m.neo.replace(/\/+$/, "").trim();
      if (!o || !n || o === n || o.includes("..") || n.includes("..") || o.startsWith("/") || n.startsWith("/"))
        continue;
      pairs.push({ old: o, neo: n, move: m.move !== false });
    }
    if (!pairs.length)
      return { moved: 0, files: 0 };
    pairs.sort((a, b) => b.old.length - a.old.length);
    let moved = 0;
    for (const p of pairs) {
      if (!p.move)
        continue;
      try {
        moved += await this.migrateMovePath(p.old, p.neo);
      } catch (e) {
      }
    }
    let files = 0, qaTouched = false;
    const qaPath = `${this.app.vault.configDir}/plugins/quickadd/data.json`;
    const targets = await this.migrationRewriteTargets();
    for (const t of targets) {
      try {
        const raw = await adapter.read(t);
        const next = rewriteEmbeddedPaths(raw, pairs);
        if (next !== null && next !== raw) {
          if (this.settings.makeBak)
            await adapter.write(`${t}.obsimind.bak`, raw);
          await adapter.write(t, next);
          files++;
          if (t === qaPath)
            qaTouched = true;
        }
      } catch (e) {
      }
    }
    if (qaTouched && this.settings.autoReloadQuickadd) {
      try {
        const plugins = this.app.plugins;
        const on = plugins && plugins.enabledPlugins && plugins.enabledPlugins.has("quickadd");
        if (on && plugins.disablePlugin && plugins.enablePlugin) {
          await plugins.disablePlugin("quickadd");
          await plugins.enablePlugin("quickadd");
        }
      } catch (e) {
      }
    }
    return { moved, files };
  }
  /* Физически переносит old→neo. old может быть файлом (с расширением) или папкой
     (тогда переносятся все вложенные файлы с сохранением структуры). Не
     перезаписывает уже существующие файлы в назначении. Возвращает число
     перенесённых файлов. */
  async migrateMovePath(oldP, neoP) {
    const adapter = this.app.vault.adapter;
    const isFile = /\.\w+$/.test(oldP);
    if (isFile) {
      if (!await adapter.exists(oldP))
        return 0;
      if (await adapter.exists(neoP))
        return 0;
      const dir = neoP.split("/").slice(0, -1).join("/");
      if (dir)
        await this.ensureFolder(dir);
      await adapter.rename(oldP, neoP);
      return 1;
    }
    if (!await adapter.exists(oldP))
      return 0;
    const all = [];
    const stack = [oldP];
    while (stack.length) {
      const dir = stack.pop();
      let listing;
      try {
        listing = await adapter.list(dir);
      } catch (e) {
        continue;
      }
      for (const f of listing.files)
        all.push(f);
      for (const sub of listing.folders)
        stack.push(sub);
    }
    let n = 0;
    for (const f of all) {
      const tail = f.slice(oldP.length);
      const dest = neoP + tail;
      try {
        if (await adapter.exists(dest))
          continue;
        const dir = dest.split("/").slice(0, -1).join("/");
        if (dir)
          await this.ensureFolder(dir);
        await adapter.rename(f, dest);
        n++;
      } catch (e) {
      }
    }
    return n;
  }
  /* Список файлов, в которых правим пути: data.json всех плагинов, core-конфиги
     с путями и .js/.json в папке скриптов. Бэкапы (.obsimind-bak) пропускаются. */
  async migrationRewriteTargets() {
    const adapter = this.app.vault.adapter;
    const cfg = this.app.vault.configDir;
    const out = [];
    const skip = (p) => p.indexOf("/.obsimind-bak/") !== -1 || p.endsWith(".obsimind.bak");
    try {
      const pl = await adapter.list(`${cfg}/plugins`);
      for (const dir of pl.folders) {
        const dp = `${dir}/data.json`;
        if (!skip(dp) && await adapter.exists(dp))
          out.push(dp);
      }
    } catch (e) {
    }
    for (const core of ["daily-notes.json", "templates.json", "new-file-location.json"]) {
      const cp = `${cfg}/${core}`;
      try {
        if (await adapter.exists(cp))
          out.push(cp);
      } catch (e) {
      }
    }
    const sf = (this.settings.scriptsFolder || "").replace(/\/+$/, "");
    if (sf) {
      const stack = [sf];
      while (stack.length) {
        const d = stack.pop();
        let listing;
        try {
          listing = await adapter.list(d);
        } catch (e) {
          continue;
        }
        for (const f of listing.files)
          if (/\.(js|json)$/i.test(f) && !skip(f))
            out.push(f);
        for (const sub of listing.folders)
          if (sub.indexOf("/.obsimind-bak") === -1)
            stack.push(sub);
      }
    }
    return out;
  }
  /* Применяет css + MOC + cmdr и возвращает строку-отчёт (для команды и integrate). */
  async applyExtrasReport(manifest) {
    const css = await this.applyCss(manifest);
    let mocPath = "", mocErr = "";
    try {
      mocPath = await this.applyMoc(manifest);
    } catch (e) {
      mocErr = e instanceof Error ? e.message : String(e);
    }
    let cmdr = { added: 0, status: "" }, cmdrErr = "";
    try {
      cmdr = await this.applyCmdr(manifest);
    } catch (e) {
      cmdrErr = e instanceof Error ? e.message : String(e);
    }
    let s = `CSS: ${css.written.length ? css.written.join(", ") : "\u0430\u043A\u0442\u0443\u0430\u043B\u044C\u043D\u043E"}`;
    if (css.failed.length)
      s += ` (\u274C ${css.failed.join(", ")})`;
    s += `
\u0414\u043E\u043C\u0430\u0448\u043D\u044F\u044F: ${mocPath ? "\u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0430" : mocErr ? "\u274C " + mocErr : "\u0430\u043A\u0442\u0443\u0430\u043B\u044C\u043D\u043E"}`;
    s += `
Commander: ${cmdrErr ? "\u274C " + cmdrErr : cmdr.status + (cmdr.added > 0 ? ` (+${cmdr.added})` : "")}`;
    let notesRep = { created: [], updated: [], errors: [] };
    try {
      notesRep = await this.applyNotes(manifest);
    } catch (e) {
      notesRep.errors.push(e instanceof Error ? e.message : String(e));
    }
    if (notesRep.created.length || notesRep.updated.length || notesRep.errors.length) {
      const parts = [];
      if (notesRep.created.length)
        parts.push(`\u0441\u043E\u0437\u0434\u0430\u043D\u043E ${notesRep.created.length}`);
      if (notesRep.updated.length)
        parts.push(`\u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u043E ${notesRep.updated.length}`);
      s += "\n\u0417\u0430\u043C\u0435\u0442\u043A\u0438/\u0448\u0430\u0431\u043B\u043E\u043D\u044B: " + (parts.join(", ") || "\u0430\u043A\u0442\u0443\u0430\u043B\u044C\u043D\u043E") + (notesRep.errors.length ? ` \u274C \u043E\u0448\u0438\u0431\u043E\u043A ${notesRep.errors.length}` : "");
    }
    let themeRep = "";
    try {
      themeRep = await this.applyTheme(manifest);
    } catch (e) {
      themeRep = "\u274C \u0422\u0435\u043C\u0430: " + (e instanceof Error ? e.message : String(e));
    }
    if (themeRep)
      s += "\n" + themeRep;
    let pcChanged = [];
    try {
      pcChanged = await this.applyPluginConfigs(manifest);
    } catch (e) {
      pcChanged = [];
    }
    if (pcChanged.length)
      s += "\n\u041A\u043E\u043D\u0444\u0438\u0433\u0438 \u043F\u043B\u0430\u0433\u0438\u043D\u043E\u0432: " + pcChanged.join(", ");
    let removedObsolete = [];
    try {
      removedObsolete = await this.applyObsoleteNotes(manifest);
    } catch (e) {
      removedObsolete = [];
    }
    if (removedObsolete.length)
      s += `
\u0423\u0431\u0440\u0430\u043D\u044B \u0441\u0442\u0430\u0440\u044B\u0435 \u0434\u0443\u0431\u043B\u0438: ${removedObsolete.length} (\u0432 .obsimind-bak/obsolete)`;
    let mig = { moved: 0, files: 0 };
    try {
      mig = await this.applyMigrations(manifest);
    } catch (e) {
      mig = { moved: 0, files: 0 };
    }
    if (mig.moved || mig.files)
      s += `
Миграция путей: перенесено файлов ${mig.moved}, исправлено ссылок в ${mig.files} конфиг./скрипт.`;
    return s;
  }
  async installExtras() {
    if (this.running)
      return;
    this.running = true;
    try {
      const { manifest } = await this.fetchManifest();
      if (!await this.precheck(manifest))
        return;
      if (!await this.ensureScriptsFolderReady(true))
        return;
      new import_obsidian.Notice("\u{1F3A8} \u041E\u0444\u043E\u0440\u043C\u043B\u0435\u043D\u0438\u0435 \u0438 \u043F\u0430\u043D\u0435\u043B\u044C:\n" + await this.applyExtrasReport(manifest) + "\n\u267B\uFE0F \u041F\u0435\u0440\u0435\u0437\u0430\u043F\u0443\u0441\u0442\u0438 Obsidian \u0434\u043B\u044F \u043F\u0440\u0438\u043C\u0435\u043D\u0435\u043D\u0438\u044F.", 16e3);
      await this.markInstalled(manifest);
    } catch (e) {
      this.err(e);
    } finally {
      this.running = false;
    }
  }
  /* Подгоняет пути под текущий vault: папку скриптов — по config-settings.json,
     заметки кнопок/домашнюю — по их именам. Для подписчиков, переименовавших папки. */
  async autodetectPaths() {
    const before = { s: this.settings.scriptsFolder, b: this.settings.buttonsNote, m: this.settings.mocNote };
    const detected = this.detectScriptsFolder();
    if (detected) {
      this.settings.scriptsFolder = detected;
      await this.saveSettings();
    }
    await this.resolveNotePath("buttonsNote");
    await this.resolveNotePath("mocNote");
    const changes = [];
    if (this.settings.scriptsFolder !== before.s)
      changes.push(`\u0441\u043A\u0440\u0438\u043F\u0442\u044B \u2192 ${this.settings.scriptsFolder}`);
    if (this.settings.buttonsNote !== before.b)
      changes.push(`\u043A\u043D\u043E\u043F\u043A\u0438 \u2192 ${this.settings.buttonsNote}`);
    if (this.settings.mocNote !== before.m)
      changes.push(`\u0434\u043E\u043C\u0430\u0448\u043D\u044F\u044F \u2192 ${this.settings.mocNote}`);
    new import_obsidian.Notice(changes.length ? "\u{1F4C1} \u041E\u043F\u0440\u0435\u0434\u0435\u043B\u0435\u043D\u043E:\n" + changes.join("\n") : "\u0412\u0441\u0451 \u0443\u0436\u0435 \u0441\u043E\u0432\u043F\u0430\u0434\u0430\u0435\u0442 \u2014 \u043C\u0435\u043D\u044F\u0442\u044C \u043D\u0435\u0447\u0435\u0433\u043E.", 9e3);
  }
  reportUpdate(r, created = []) {
    let msg = "";
    if (r.done.length)
      msg += `\u2705 \u041E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u043E: ${r.done.join(", ")}`;
    if (created.length)
      msg += (msg ? "\n" : "") + `\u{1F195} \u0421\u043E\u0437\u0434\u0430\u043D\u044B \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438: ${created.join(", ")}`;
    if (r.skipped.length)
      msg += (msg ? "\n" : "") + `\u23ED\uFE0F \u041F\u0440\u043E\u043F\u0443\u0449\u0435\u043D\u043E (\u043D\u0435 .js / \u043D\u0435\u0442 \u0432 \u043C\u0430\u043D\u0438\u0444\u0435\u0441\u0442\u0435): ${r.skipped.join(", ")}`;
    if (r.failed.length)
      msg += (msg ? "\n" : "") + `\u274C \u041E\u0448\u0438\u0431\u043A\u0438: ${r.failed.join(", ")}`;
    if (r.done.length)
      msg += "\n\u267B\uFE0F \u041F\u0435\u0440\u0435\u0437\u0430\u043F\u0443\u0441\u0442\u0438 Obsidian, \u0447\u0442\u043E\u0431\u044B \u043F\u0440\u0438\u043C\u0435\u043D\u0438\u0442\u044C.";
    new import_obsidian.Notice(msg || "\u041D\u0435\u0447\u0435\u0433\u043E \u043E\u0431\u043D\u043E\u0432\u043B\u044F\u0442\u044C", 13e3);
  }
  /* \u2500\u2500 \u0417\u0430\u043C\u0435\u0442\u043A\u0438 \u0438\u0437 \u043C\u0430\u043D\u0438\u0444\u0435\u0441\u0442\u0430 (notes) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
     \u0421\u043E\u0437\u0434\u0430\u0451\u0442 \u043D\u0435\u0434\u043E\u0441\u0442\u0430\u044E\u0449\u0438\u0435 \u0437\u0430\u043C\u0435\u0442\u043A\u0438 (\u043D\u0430\u043F\u0440. \u00AB\u041C\u043E\u0438 \u0430\u0433\u0435\u043D\u0442\u044B\u00BB, \u00ABMOC - Buttons\u00BB) \u0432 \u043D\u0443\u0436\u043D\u043E\u043C
     \u043C\u0435\u0441\u0442\u0435. \u0421\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u044E\u0449\u0443\u044E (\u043F\u043E basename \u0433\u0434\u0435 \u0443\u0433\u043E\u0434\u043D\u043E) \u041D\u0415 \u0434\u0443\u0431\u043B\u0438\u0440\u0443\u0435\u0442. createOnly=true \u2014
     \u043B\u0438\u0447\u043D\u0443\u044E \u0437\u0430\u043C\u0435\u0442\u043A\u0443 \u043D\u0435 \u0442\u0440\u043E\u0433\u0430\u0435\u043C; \u0438\u043D\u0430\u0447\u0435 \u043E\u0431\u043D\u043E\u0432\u043B\u044F\u0435\u043C \u043F\u043E \u0445\u044D\u0448\u0443 \u0441 \u0431\u044D\u043A\u0430\u043F\u043E\u043C. */
  async applyNotes(manifest) {
    const notes = manifest.notes || {};
    const created = [], updated = [], errors = [];
    const targets = Object.keys(notes);
    if (!targets.length)
      return { created, updated, errors };
    const adapter = this.app.vault.adapter;
    for (const targetPath of targets) {
      const meta = notes[targetPath];
      if (!meta || typeof meta.content !== "string")
        continue;
      const base = targetPath.split("/").pop() || "note.md";
      try {
        let existingPath = await adapter.exists(targetPath) ? targetPath : null;
        if (!existingPath) {
          const hit = this.app.vault.getMarkdownFiles().find((f) => f.name === base);
          if (hit)
            existingPath = hit.path;
        }
        if (existingPath) {
          if (meta.createOnly !== false)
            continue;
          let local = null;
          try {
            local = await sha256Hex(await adapter.readBinary(existingPath));
          } catch (e) {
          }
          if (local === meta.sha256)
            continue;
          if (this.settings.makeBak) {
            const bakDir = `${this.folder()}/${BAK_DIR}`;
            await this.ensureFolder(bakDir);
            await adapter.write(`${bakDir}/${base}.${Date.now()}.bak`, await adapter.read(existingPath));
          }
          await adapter.write(existingPath, meta.content);
          updated.push(base);
          continue;
        }
        const dir = targetPath.split("/").slice(0, -1).join("/");
        if (dir)
          await this.ensureFolder(dir);
        await adapter.write(targetPath, meta.content);
        created.push(base);
      } catch (e) {
        errors.push(`${base} (${e instanceof Error ? e.message : String(e)})`);
      }
    }
    return { created, updated, errors };
  }
  /* \u2500\u2500 \u041F\u043E\u043B\u043D\u044B\u0439 \u0441\u043D\u0438\u043C\u043E\u043A \u0414\u041E \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0438 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
     \u0411\u044D\u043A\u0430\u043F\u0438\u0442 \u0432\u0441\u0435 \u0446\u0435\u043B\u0435\u0432\u044B\u0435 \u0444\u0430\u0439\u043B\u044B (\u0441\u043A\u0440\u0438\u043F\u0442\u044B, css, MOC, \u043A\u043D\u043E\u043F\u043A\u0438, \u0437\u0430\u043C\u0435\u0442\u043A\u0438, QuickAdd,
     Commander) \u0432 .obsimind-bak/restore-<ts>/ \u0438 \u0437\u0430\u043F\u043E\u043C\u0438\u043D\u0430\u0435\u0442, \u043A\u0430\u043A\u0438\u0435 \u043F\u043B\u0430\u0433\u0438\u043D\u044B \u0431\u044B\u043B\u0438
     \u0432\u043A\u043B\u044E\u0447\u0435\u043D\u044B. \u041A\u043D\u043E\u043F\u043A\u0430 \u00AB\u0412\u0435\u0440\u043D\u0443\u0442\u044C \u0432\u0441\u0451 \u043D\u0430\u0437\u0430\u0434\u00BB \u044D\u0442\u043E \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0435\u0442. \u041F\u043B\u0430\u0433\u0438\u043D\u044B \u041D\u0415 \u0443\u0434\u0430\u043B\u044F\u044E\u0442\u0441\u044F. */
  async createRestorePoint(manifest) {
    try {
      const adapter = this.app.vault.adapter;
      const ts = Date.now();
      const folder = this.folder();
      const configDir = this.app.vault.configDir;
      const restoreDir = `${folder}/${BAK_DIR}/restore-${ts}`;
      await this.ensureFolder(restoreDir);
      const targets = [];
      for (const name of Object.keys(manifest.scripts || {}))
        targets.push(`${folder}/${name}`);
      for (const name of Object.keys(manifest.css || {}))
        targets.push(`${configDir}/snippets/${name}`);
      if (manifest.moc)
        targets.push(await this.resolveNotePath("mocNote"));
      targets.push(await this.resolveNotePath("buttonsNote"));
      for (const p of Object.keys(manifest.notes || {})) {
        const base = p.split("/").pop();
        const hit = base ? this.app.vault.getMarkdownFiles().find((f) => f.name === base) : null;
        targets.push(hit ? hit.path : p);
      }
      targets.push(`${configDir}/plugins/quickadd/data.json`);
      targets.push(`${configDir}/plugins/cmdr/data.json`);
      targets.push(`${configDir}/plugins/templater-obsidian/data.json`);
      targets.push(`${configDir}/plugins/note-locker/data.json`);
      targets.push(`${configDir}/plugins/homepage/data.json`);
      for (const id of Object.keys(manifest.pluginConfigs || {}))
        targets.push(`${configDir}/plugins/${id}/data.json`);
      for (const rel of manifest.obsoleteNotes || [])
        targets.push(rel);
      targets.push(`${configDir}/appearance.json`);
      if (manifest.theme && manifest.theme.name && manifest.theme.files) {
        for (const f of Object.keys(manifest.theme.files))
          targets.push(`${configDir}/themes/${manifest.theme.name}/${f}`);
      }
      const seen = /* @__PURE__ */ new Set();
      const files = [];
      let idx = 0;
      for (const p of targets) {
        if (!p || seen.has(p))
          continue;
        seen.add(p);
        const existed = await adapter.exists(p);
        let backup = "";
        if (existed) {
          backup = `${restoreDir}/${idx}__${p.split("/").pop() || "file"}`;
          try {
            await adapter.writeBinary(backup, await adapter.readBinary(p));
          } catch (e) {
            backup = "";
          }
        }
        files.push({ path: p, existed, backup });
        idx++;
      }
      const plugins = this.pluginsApi();
      const enabled = plugins && plugins.enabledPlugins ? plugins.enabledPlugins : /* @__PURE__ */ new Set();
      const removeList = manifest.noRemovePlugins ? [] : Array.isArray(manifest.removePlugins) && manifest.removePlugins.length ? manifest.removePlugins : DEFAULT_REMOVE_PLUGINS;
      const reEnablePlugins = removeList.filter((id) => enabled.has && enabled.has(id));
      // плагины, которые установка ВКЛЮЧИТ (ecosystem, cmdr и др.) — чтобы откат их выключил, если их не было.
      const installPlugins = Object.keys(manifest.plugins || {});
      const installPluginsEnabledBefore = installPlugins.filter((id) => enabled.has && enabled.has(id));
      const rp = { time: ts, version: manifest.resolvedVersion || "", dir: restoreDir, files, reEnablePlugins, installPlugins, installPluginsEnabledBefore };
      this.settings.restorePoints = [...this.settings.restorePoints, rp].slice(-MAX_RESTORE_POINTS);
      await this.saveSettings();
      await this.pruneRestorePoints();
    } catch (e) {
      console.error("createRestorePoint:", e);
    }
  }
  /* \u041F\u043E\u043B\u043D\u044B\u0439 \u043E\u0442\u043A\u0430\u0442: \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u0430\u0432\u043B\u0438\u0432\u0430\u0435\u0442 \u0444\u0430\u0439\u043B\u044B \u0438\u0437 \u0441\u043D\u0438\u043C\u043A\u0430, \u0437\u0430\u043D\u043E\u0432\u043E \u0432\u043A\u043B\u044E\u0447\u0430\u0435\u0442 \u043E\u0442\u043A\u043B\u044E\u0447\u0451\u043D\u043D\u044B\u0435
     \u043F\u043B\u0430\u0433\u0438\u043D\u044B \u0438 \u0432\u044B\u043A\u043B\u044E\u0447\u0430\u0435\u0442 ecosystem (\u0435\u0441\u043B\u0438 \u0435\u0433\u043E \u043D\u0435 \u0431\u044B\u043B\u043E). \u0421\u043E\u0437\u0434\u0430\u043D\u043D\u043E\u0435 \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u043E\u0439 \u2014
     \u0443\u0434\u0430\u043B\u044F\u0435\u0442. \u041F\u043B\u0430\u0433\u0438\u043D\u044B \u041D\u0415 \u0443\u0434\u0430\u043B\u044F\u044E\u0442\u0441\u044F. */
  async revertAll(rp) {
    const adapter = this.app.vault.adapter;
    const restored = [], removed = [], failed = [];
    for (const it of rp.files || []) {
      const base = (it.path || "").split("/").pop() || "";
      try {
        if (it.existed && it.backup) {
          if (await adapter.exists(it.backup)) {
            const dir = it.path.split("/").slice(0, -1).join("/");
            if (dir)
              await this.ensureFolder(dir);
            await adapter.writeBinary(it.path, await adapter.readBinary(it.backup));
            restored.push(base);
          } else {
            failed.push(base + " (\u0431\u044D\u043A\u0430\u043F \u0443\u0434\u0430\u043B\u0451\u043D)");
          }
        } else if (!it.existed) {
          if (await adapter.exists(it.path)) {
            await adapter.remove(it.path);
            removed.push(base);
          }
        }
      } catch (e) {
        failed.push(base);
      }
    }
    const plugins = this.pluginsApi();
    const reEnabled = [], reDisabled = [];
    for (const id of rp.reEnablePlugins || []) {
      try {
        if (plugins == null ? void 0 : plugins.enablePluginAndSave)
          await plugins.enablePluginAndSave(id);
        else if (plugins == null ? void 0 : plugins.enablePlugin)
          await plugins.enablePlugin(id);
        reEnabled.push(id);
      } catch (e) {
      }
    }
    // выключить плагины, которые установка ВКЛЮЧИЛА (а до неё их не было). Поддержка
    // старого формата снимка (ecosystemWasEnabled) — на случай ранее созданных точек.
    const installSet = Array.isArray(rp.installPlugins) ? rp.installPlugins : [ECOSYSTEM_PLUGIN_ID];
    const wasEnabled = Array.isArray(rp.installPluginsEnabledBefore) ? rp.installPluginsEnabledBefore : rp.ecosystemWasEnabled ? [ECOSYSTEM_PLUGIN_ID] : [];
    for (const id of installSet) {
      if (wasEnabled.includes(id))
        continue;
      try {
        if (plugins == null ? void 0 : plugins.disablePluginAndSave)
          await plugins.disablePluginAndSave(id);
        else if (plugins == null ? void 0 : plugins.disablePlugin)
          await plugins.disablePlugin(id);
        reDisabled.push(id);
      } catch (e) {
      }
    }
    this.settings.restorePoints = this.settings.restorePoints.filter((x) => x !== rp);
    await this.saveSettings();
    let msg = "\u21A9\uFE0F \u0412\u043E\u0437\u0432\u0440\u0430\u0442 \u043A \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u044E \u0434\u043E \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0438\n";
    if (restored.length)
      msg += `\u0412\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u043E: ${restored.join(", ")}
`;
    if (removed.length)
      msg += `\u0423\u0434\u0430\u043B\u0435\u043D\u043E (\u0441\u043E\u0437\u0434\u0430\u043D\u043E \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u043E\u0439): ${removed.join(", ")}
`;
    if (reEnabled.length)
      msg += `\u0421\u043D\u043E\u0432\u0430 \u0432\u043A\u043B\u044E\u0447\u0435\u043D\u044B \u043F\u043B\u0430\u0433\u0438\u043D\u044B: ${reEnabled.join(", ")}
`;
    if (reDisabled.length)
      msg += `\u041E\u0442\u043A\u043B\u044E\u0447\u0451\u043D: ${reDisabled.join(", ")}
`;
    if (failed.length)
      msg += `\u274C ${failed.join(", ")}
`;
    msg += "\u267B\uFE0F \u041F\u0435\u0440\u0435\u0437\u0430\u043F\u0443\u0441\u0442\u0438 Obsidian.";
    new import_obsidian.Notice(msg, 18e3);
  }
  /* \u0423\u0434\u0430\u043B\u044F\u0435\u0442 \u043F\u0430\u043F\u043A\u0438 \u0441\u043D\u0438\u043C\u043A\u043E\u0432, \u043A\u043E\u0442\u043E\u0440\u044B\u0445 \u0443\u0436\u0435 \u043D\u0435\u0442 \u0432 \u0441\u043F\u0438\u0441\u043A\u0435 restorePoints. */
  async pruneRestorePoints() {
    try {
      const adapter = this.app.vault.adapter;
      const keep = /* @__PURE__ */ new Set((this.settings.restorePoints || []).map((r) => r.dir));
      const root = `${this.folder()}/${BAK_DIR}`;
      if (!await adapter.exists(root))
        return;
      const listed = await adapter.list(root);
      for (const d of listed.folders || []) {
        const base = d.split("/").pop() || "";
        if (base.startsWith("restore-") && !keep.has(d)) {
          try {
            await adapter.rmdir(d, true);
          } catch (e) {
          }
        }
      }
    } catch (e) {
    }
  }
  err(e) {
    new import_obsidian.Notice(`\u274C ${e instanceof Error ? e.message : String(e)}`, 9e3);
  }
};
/* ═══════════ МАСТЕР ОБНОВЛЕНИЙ ═══════════
   Показывает изменения по одному: что изменилось, как этим пользоваться и что
   именно будет записано. Подписчик отвечает ДА/НЕТ на каждое.
   «НЕТ» = файлы пункта не скачиваются вообще → сломать ничего не может. */
var WIZARD_CSS = `
/* Окно пошире: длинные тексты и списки читаются спокойнее. */
.obsimind-wiz { width: min(820px, 94vw); }
.obsimind-wiz .modal-content { padding: 0; overflow-x: hidden; max-height: 76vh; overflow-y: auto; }
/* Модалка не должна ехать по горизонтали ни на одном экране. */
.obsimind-wiz .modal-content, .obsimind-wiz .modal-content * { min-width: 0; }
.obsimind-wiz-head { display:flex; align-items:center; flex-wrap:wrap; gap:6px 10px; padding: 2px 2px 10px;
  color: var(--text-muted); font-size:.9em; }
.obsimind-wiz-head > span { min-width:0; overflow-wrap:break-word; }
.obsimind-wiz-count { margin-left:auto; color: var(--text-faint); font-size:.95em;
  font-variant-numeric: tabular-nums; }
/* Прогресс — без цветов: пройденное серым, текущий чуть темнее. */
.obsimind-wiz-dots { display:flex; gap:3px; margin-bottom:16px; }
.obsimind-wiz-dot { flex:1; height:3px; border-radius:2px; background: var(--background-modifier-border);
  transition: background .18s ease; cursor:pointer; }
.obsimind-wiz-dot.is-yes { background: var(--text-muted); }
.obsimind-wiz-dot.is-no  { background: var(--background-modifier-border); }
.obsimind-wiz-dot.is-cur { background: var(--text-normal); }
/* Карточка изменения — минимум: заголовок, одна мысль, кнопки.
   Всё остальное под «Подробнее». Никаких цветов и эмодзи. */
.obsimind-wiz-card { border:1px solid var(--background-modifier-border); border-radius:12px;
  padding:20px 22px; background: var(--background-primary); }
.obsimind-wiz-title { font-size:1.18em; font-weight:700; line-height:1.3; margin:0;
  overflow-wrap:break-word; color: var(--text-normal); }
.obsimind-wiz-title.is-file { font-family: var(--font-monospace); font-size:1.06em; }
.obsimind-wiz-sub { margin-top:5px; font-size:.86em; color: var(--text-faint); line-height:1.45; }
.obsimind-wiz-lead { font-size:1.02em; line-height:1.6; margin:14px 0 0; color: var(--text-normal); }
.obsimind-wiz-more { margin-top:16px; font-size:.9em; color: var(--text-muted); }
.obsimind-wiz-more > summary { cursor:pointer; color: var(--text-muted); font-weight:600;
  padding:6px 0; list-style:none; }
.obsimind-wiz-more > summary::marker, .obsimind-wiz-more > summary::-webkit-details-marker { display:none; }
.obsimind-wiz-more > summary::before { content:"▸ "; color: var(--text-faint); }
.obsimind-wiz-more[open] > summary::before { content:"▾ "; }
.obsimind-wiz-more > summary:hover { color: var(--text-normal); }
.obsimind-wiz-more .in { padding:6px 0 2px; line-height:1.55; display:grid; gap:14px;
  border-top:1px solid var(--background-modifier-border); margin-top:4px; padding-top:12px; }
.obsimind-wiz-more .in h5 { margin:0 0 4px; font-size:.95em; font-weight:600; color: var(--text-normal); }
.obsimind-wiz-more .in p { margin:0; }
.obsimind-wiz-more ul { margin:0; padding-left:18px; }
.obsimind-wiz-more li { margin:4px 0; overflow-wrap:anywhere; }
.obsimind-wiz-more ul.files { list-style:none; padding-left:0; }
.obsimind-wiz-more ul.files li { display:block; }
.obsimind-wiz-more ul.files .nm { font-family: var(--font-monospace); font-size:.94em;
  color: var(--text-normal); }
/* Ожидание сервера — спокойное кольцо, без цвета. */
.obsimind-wiz-wait { display:flex; flex-direction:column; align-items:center; gap:14px;
  padding:48px 20px; color: var(--text-muted); text-align:center; }
.obsimind-wiz-spin { width:26px; height:26px; border-radius:50%;
  border:2px solid var(--background-modifier-border); border-top-color: var(--text-muted);
  animation: obsimind-spin .8s linear infinite; }
@keyframes obsimind-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .obsimind-wiz-spin { animation-duration: 2.4s; } }
@media (max-width: 640px) {
  .obsimind-wiz-card { padding:16px; }
  .obsimind-wiz-title { font-size:1.1em; }
}
/* Выбор версии. ВАЖНО: карточки — это div[role=button], а не <button>:
   у кнопок в Obsidian white-space:nowrap, и блочный текст внутри них
   схлопывается в одну строку с горизонтальной прокруткой. */
.obsimind-wiz-intro { color: var(--text-muted); line-height:1.5; margin:0 0 16px; font-size:.94em; }
.obsimind-wiz-choice { display:flex; flex-direction:column; gap:10px; margin-bottom:14px; }
.obsimind-wiz-opt { display:grid; grid-template-columns:22px 1fr; gap:12px; align-items:start;
  width:100%; box-sizing:border-box; text-align:left; white-space:normal; overflow-wrap:break-word;
  border:1px solid var(--background-modifier-border); border-left:3px solid var(--background-modifier-border);
  border-radius:12px; padding:14px 16px; background:var(--background-primary); cursor:pointer;
  transition:border-color .12s ease, background .12s ease; }
.obsimind-wiz-opt:hover { border-color:var(--background-modifier-border-focus); }
.obsimind-wiz-opt:focus-visible { outline:2px solid var(--interactive-accent); outline-offset:2px; }
.obsimind-wiz-opt.is-sel { border-color:var(--text-faint); border-left-color:var(--interactive-accent);
  background:var(--background-modifier-hover); }
.obsimind-wiz-mark { width:20px; height:20px; margin-top:2px; border-radius:50%; box-sizing:border-box;
  border:2px solid var(--background-modifier-border); display:flex; align-items:center; justify-content:center;
  font-size:11px; font-weight:900; color:transparent; }
.obsimind-wiz-opt.is-sel .obsimind-wiz-mark { border-color:var(--interactive-accent);
  background:var(--interactive-accent); color:var(--text-on-accent); }
.obsimind-wiz-opt .h { display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:5px; }
.obsimind-wiz-opt .h .nm { font-size:1.05em; font-weight:700; color:var(--text-normal); line-height:1.3; }
.obsimind-wiz-opt .tag { flex:none; font-size:.72em; font-weight:600; letter-spacing:.02em;
  padding:2px 8px; border-radius:6px; color:var(--text-faint);
  border:1px solid var(--background-modifier-border); }
.obsimind-wiz-opt .tag.is-rec { color:var(--text-normal); border-color:var(--text-faint); }
.obsimind-wiz-opt p { margin:0 0 8px; color:var(--text-muted); line-height:1.5; font-size:.92em; }
.obsimind-wiz-opt ul { margin:0; padding-left:16px; color:var(--text-muted); font-size:.9em; }
.obsimind-wiz-opt li { margin:3px 0; line-height:1.45; }
.obsimind-wiz-why { margin:0 0 14px; padding-left:12px; border-left:2px solid var(--background-modifier-border);
  color:var(--text-faint); font-size:.84em; line-height:1.5; }
@media (max-width: 640px) {
  .obsimind-wiz-opt { padding:13px 14px; gap:10px; grid-template-columns:20px 1fr; }
  .obsimind-wiz-opt ul { padding-left:15px; }
}
.obsimind-wiz-sec { margin-bottom:12px; }
.obsimind-wiz-sec h4 { margin:0 0 5px; font-size:.74em; text-transform:uppercase; letter-spacing:.06em;
  color: var(--text-faint); font-weight:700; }
.obsimind-wiz-sec ul { margin:0; padding-left:18px; }
.obsimind-wiz-sec li { margin:3px 0; line-height:1.45; }
.obsimind-wiz-sec p { margin:0; line-height:1.5; }
.obsimind-wiz-files { font-size:.85em; color: var(--text-muted); margin-top:4px; }
.obsimind-wiz-files summary { cursor:pointer; color: var(--text-faint); }
.obsimind-wiz-files li, .obsimind-wiz-files code { overflow-wrap:anywhere; white-space:normal; }
/* Ответ: акцент только на «Поставить» (класс mod-cta от Obsidian).
   Выбранное отмечаем рамкой, а не цветной заливкой. */
.obsimind-wiz-answer { display:flex; gap:10px; margin-top:20px; }
.obsimind-wiz-answer button { flex:1; min-width:0; padding:11px 10px; border-radius:9px; font-weight:600;
  cursor:pointer; white-space:normal; line-height:1.3; height:auto; }
.obsimind-wiz-answer button.sel-yes { box-shadow: inset 0 0 0 2px var(--interactive-accent); }
.obsimind-wiz-answer button.sel-no { box-shadow: inset 0 0 0 2px var(--text-muted); }
.obsimind-wiz-nav { display:flex; align-items:center; gap:8px; margin-top:14px; }
.obsimind-wiz-nav .spacer { flex:1; }
.obsimind-wiz-hint { color: var(--text-faint); font-size:.78em; text-align:center; margin-top:10px; }
.obsimind-wiz-safe { background: rgba(34,197,94,.08); border:1px solid rgba(34,197,94,.3);
  border-radius:10px; padding:10px 12px; font-size:.85em; color: var(--text-muted);
  margin-bottom:14px; line-height:1.5; }
.obsimind-wiz-sumtable { border:1px solid var(--background-modifier-border); border-radius:10px;
  overflow:hidden; margin-bottom:14px; }
.obsimind-wiz-sumrow { display:flex; align-items:center; gap:12px; padding:10px 14px; cursor:pointer;
  border-bottom:1px solid var(--background-modifier-border); font-size:.94em; }
.obsimind-wiz-sumrow:hover { background: var(--background-modifier-hover); }
.obsimind-wiz-sumrow:last-child { border-bottom:none; }
.obsimind-wiz-sumrow .nm { flex:1; min-width:0; }
.obsimind-wiz-sumrow .st { font-size:.82em; font-variant-numeric:tabular-nums; }
.obsimind-wiz-sumrow .st.yes { color: var(--text-normal); font-weight:600; }
.obsimind-wiz-sumrow .st.no { color: var(--text-faint); }
`;
/* Назначение файлов — чтобы в разборе стояло «имя файла — что это делает».
   Составлено по самим скриптам; чего не знаем, показываем просто именем. */
var FILE_INFO = {
  "FSRS_01.js": "интервальное повторение: карточки на сегодня",
  "FSRS_02.js": "интервальное повторение: добавить заметку в карточки",
  "RSS-news.js": "новости по твоим темам",
  "advanced-review-notes.js": "обзор и разбор заметок",
  "ai-graph-linker.js": "карта связей между заметками",
  "ai-redactor.js": "ИИ-редактор выделенного текста",
  "backlink-show.js": "обратные ссылки внизу заметки",
  "button-creator.js": "создание кнопок",
  "calory-tracker.js": "подсчёт калорий по фото и тексту",
  "config.js": "общие настройки и выбор ИИ-модели для всех скриптов",
  "consilium.js": "консилиум ИИ-экспертов по вопросу",
  "drawing-ai.js": "рисунок с помощью ИИ",
  "embeding-01.js": "сборка поисковой базы по заметкам",
  "embeding-02.js": "похожие заметки и родительский MOC",
  "embeding-03.js": "поиск по смыслу",
  "explainator.js": "объяснение выделенного текста",
  "habits-editor.js": "настройка привычек",
  "image-to-clothes-note.js": "фото в свойство заметки",
  "image-to-note.js": "вставка рисунка или фото",
  "image-to-text-in-note.js": "распознать текст с фото прямо в заметку",
  "image-to-text.js": "распознать текст с фото и задать по нему вопрос",
  "media-summary.js": "конспект видео и аудио",
  "mocs-show.js": "список страниц-разделов",
  "orphan-hunter.js": "заметки, на которые никто не ссылается",
  "poisk-new-books.js": "подбор книг с обложками",
  "poisk-new-films.js": "подбор фильмов и сериалов",
  "project-to-daily_01.js": "задачи проекта в ежедневную заметку",
  "training-render.js": "тренировка дня на странице",
  "training-settings.js": "настройки тренировок",
  "updater.js": "прежний способ обновления скриптов",
  "voice-to-text.js": "голос в текст",
  "word-english.js": "перевод слов с добавлением в повторение",
  "obsimind-ecosystem": "главный плагин Системы",
  "cmdr": "кнопки на панели слева",
  "elton-reader-books": "читалка книг",
  "global-book-search": "поиск книг",
  "obsidian-excalidraw-plugin": "рисование",
  "obsidian-meta-bind-plugin": "интерактивные поля: привычки, галочки",
  "find-orphaned-images": "поиск неиспользуемых картинок",
  "improved-random-note": "случайная заметка",
  "lazy-plugins": "ускорение запуска Obsidian",
  "local-backup": "локальные копии хранилища",
  "quickadd": "команды запуска скриптов",
  "templater-obsidian": "заготовки заметок",
  "note-locker": "защита страниц от случайной правки",
  "homepage": "какая заметка открывается при запуске"
};
var UpdateWizardModal = class extends import_obsidian.Modal {
  constructor(app, manifest, items, declined, onDone) {
    super(app);
    this.manifest = manifest;
    this.items = items;
    this.onDone = onDone;
    this.idx = 0;
    this.styleEl = null;
    this.answers = /* @__PURE__ */ new Map();
    const dec = new Set(declined || []);
    this.declinedBefore = dec;
    // По умолчанию: ДА для рекомендованных; НЕТ — если раньше уже отказывался.
    for (const it of items)
      this.answers.set(it.id, dec.has(it.id) ? false : it.recommended !== false);
  }
  onOpen() {
    this.modalEl.addClass("obsimind-wiz");
    this.styleEl = document.head.createEl("style", { text: WIZARD_CSS });
    this.scope.register([], "ArrowRight", () => { this.go(1); return false; });
    this.scope.register([], "ArrowLeft", () => { this.go(-1); return false; });
    this.render();
  }
  onClose() {
    this.contentEl.empty();
    if (this.styleEl)
      this.styleEl.remove();
  }
  go(delta) {
    this.idx = Math.max(0, Math.min(this.items.length, this.idx + delta));
    this.render();
  }
  paintDots(dots) {
    this.items.forEach((it, i) => {
      const d = dots.children[i];
      if (!d)
        return;
      d.removeClass("is-yes");
      d.removeClass("is-no");
      d.removeClass("is-cur");
      if (i === this.idx)
        d.addClass("is-cur");
      else
        d.addClass(this.answers.get(it.id) ? "is-yes" : "is-no");
    });
  }
  /* Если пункт про один файл — возвращаем его имя, чтобы поставить в заголовок. */
  singleFile(item) {
    const a = item.affects || {};
    const all = [...a.scripts || [], ...a.plugins || [], ...a.css || []];
    const heavy = (a.notes || []).length || a.moc || a.cmdr || a.theme || a.obsolete || a.migrations || a.removePlugins || (a.pluginConfigs || []).length || (a.integrations || []).length;
    return all.length === 1 && !heavy ? all[0] : "";
  }
  /* Одна серая строка вместо цветных плашек: сколько чего затронет пункт. */
  scopeLine(item) {
    const f = this.factList(item);
    if (!f.length)
      return "";
    return "Затронет: " + f.map((x) => (x.n ? x.n + " " : "") + x.label).join(" · ");
  }
  /* Разбор по файлам: «имя файла — что это делает». */
  fileLines(item) {
    const a = item.affects || {};
    const m = this.manifest || {};
    const out = [];
    const add = (name, fallback) => out.push({ name, info: FILE_INFO[name] || fallback || "" });
    (a.scripts || []).forEach((s) => add(s));
    (a.plugins || []).forEach((s) => add(s, "плагин"));
    (a.pluginConfigs || []).forEach((s) => add(s, "настройки плагина"));
    (a.css || []).forEach((s) => add(s, "оформление"));
    (a.integrations || []).forEach((s) => add(s, "команда запуска"));
    (a.seeds || []).forEach((s) => add(s, "файл настроек, если его нет"));
    (a.notes || []).forEach((p) => {
      const meta = (m.notes || {})[p];
      out.push({ name: (p.split("/").pop() || p).replace(/\.md$/, ""), info: meta && meta.createOnly === false ? "страница Системы, старая уйдёт в копии" : "создастся, только если её нет" });
    });
    if (a.moc)
      out.push({ name: "MOC - HOME", info: "домашняя страница" });
    if (a.cmdr)
      out.push({ name: "Кнопки слева", info: "добавятся отсутствующие" });
    if (a.theme && m.theme && m.theme.name)
      out.push({ name: m.theme.name, info: "тема оформления, станет активной" });
    if (a.removePlugins)
      (m.removePlugins || []).forEach((id) => out.push({ name: id, info: "выключится (не удалится)" }));
    if (a.obsolete)
      (m.obsoleteNotes || []).forEach((p) => out.push({ name: p.split("/").pop() || p, info: "старая копия уйдёт в бэкап и удалится" }));
    if (a.migrations)
      (m.migrations || []).forEach((x) => out.push({ name: x.old, info: "переедет в " + x.neo }));
    return out;
  }
  /* Короткая «визуализация» объёма: сколько чего затронет карточка.
     Заменяет длинные перечисления — читается одним взглядом. */
  factList(item) {
    const a = item.affects || {};
    const m = this.manifest || {};
    const out = [];
    const plural = (n, one, few, many) => n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many;
    const n = (v) => (v || []).length;
    if (n(a.scripts))
      out.push({ n: n(a.scripts), label: plural(n(a.scripts), "скрипт", "скрипта", "скриптов") });
    if (n(a.notes)) {
      const upd = (a.notes || []).filter((p) => (m.notes || {})[p] && m.notes[p].createOnly === false).length;
      out.push({ n: n(a.notes), label: plural(n(a.notes), "страница", "страницы", "страниц") + (upd ? `, из них ${upd} с заменой` : ", только новые") });
    }
    if (n(a.css))
      out.push({ n: n(a.css), label: plural(n(a.css), "файл оформления", "файла оформления", "файлов оформления") });
    if (a.theme && m.theme && m.theme.name)
      out.push({ n: 0, label: "тема " + m.theme.name });
    if (a.moc)
      out.push({ n: 0, label: "домашняя страница" });
    if (a.cmdr)
      out.push({ n: 0, label: "кнопки слева" });
    if (n(a.integrations))
      out.push({ n: n(a.integrations), label: plural(n(a.integrations), "команда запуска", "команды запуска", "команд запуска") });
    if (n(a.plugins))
      out.push({ n: n(a.plugins), label: plural(n(a.plugins), "плагин", "плагина", "плагинов") });
    if (n(a.pluginConfigs))
      out.push({ n: n(a.pluginConfigs), label: "настройки плагинов" });
    if (n(a.seeds))
      out.push({ n: n(a.seeds), label: "файлов настроек" });
    if (a.removePlugins) {
      const k = (m.removePlugins || []).length;
      out.push({ n: k, label: "выключит " + plural(k, "плагин", "плагина", "плагинов") });
    }
    if (a.obsolete) {
      const k = (m.obsoleteNotes || []).length;
      out.push({ n: k, label: "уберёт " + plural(k, "дубль", "дубля", "дублей") });
    }
    if (a.migrations) {
      const k = (m.migrations || []).length;
      out.push({ n: k, label: "перенесёт " + plural(k, "папку", "папки", "папок") });
    }
    return out;
  }
  render() {
    const { contentEl } = this;
    contentEl.empty();
    if (this.idx >= this.items.length)
      return this.renderSummary();
    const item = this.items[this.idx];
    const cl = this.manifest.changelog || {};
    const head = contentEl.createDiv({ cls: "obsimind-wiz-head" });
    const t = head.createSpan({ text: (cl.title || "Обновление Системы") + (this.manifest.resolvedVersion ? "  ·  " + this.manifest.resolvedVersion : "") });
    t.style.fontWeight = "600";
    head.createSpan({ cls: "obsimind-wiz-count", text: `${this.idx + 1} / ${this.items.length}` });
    const dots = contentEl.createDiv({ cls: "obsimind-wiz-dots" });
    this.items.forEach((it, i) => {
      const d = dots.createDiv({ cls: "obsimind-wiz-dot" });
      d.onclick = () => { this.idx = i; this.render(); };
    });
    this.paintDots(dots);
    const card = contentEl.createDiv({ cls: "obsimind-wiz-card" });
    // Заголовок — имя файла, если пункт про один файл. Иначе обычное название.
    const single = this.singleFile(item);
    card.createDiv({ cls: "obsimind-wiz-title" + (single ? " is-file" : ""), text: single || item.title });
    const sub = single ? item.title : this.scopeLine(item);
    if (sub)
      card.createDiv({ cls: "obsimind-wiz-sub", text: sub });
    if (item.summary)
      card.createEl("p", { cls: "obsimind-wiz-lead", text: item.summary });
    if (this.declinedBefore.has(item.id))
      card.createDiv({ cls: "obsimind-wiz-sub", text: "В прошлый раз ты это пропустил." });
    // Всё остальное — под одной раскрывашкой, чтобы карточка не пугала текстом.
    const what = (item.what || []).filter(Boolean);
    const files = this.fileLines(item);
    if (what.length || item.why || item.how || files.length) {
      const det = card.createEl("details", { cls: "obsimind-wiz-more" });
      det.createEl("summary", { text: "Подробнее" });
      const box = det.createDiv({ cls: "in" });
      if (what.length) {
        const b = box.createDiv();
        b.createEl("h5", { text: "Что произойдёт" });
        const ul = b.createEl("ul");
        what.forEach((w) => ul.createEl("li", { text: w }));
      }
      if (item.why) {
        const b = box.createDiv();
        b.createEl("h5", { text: "Зачем это нужно" });
        b.createEl("p", { text: item.why });
      }
      if (item.how) {
        const b = box.createDiv();
        b.createEl("h5", { text: "Что делать тебе" });
        b.createEl("p", { text: item.how });
      }
      if (files.length) {
        const b = box.createDiv();
        b.createEl("h5", { text: `Что именно меняется (${files.length})` });
        const ul = b.createEl("ul", { cls: "files" });
        for (const f of files) {
          const li = ul.createEl("li");
          li.createSpan({ cls: "nm", text: f.name });
          if (f.info)
            li.createSpan({ text: " — " + f.info });
        }
      }
    }
    const ans = card.createDiv({ cls: "obsimind-wiz-answer" });
    const yes = ans.createEl("button", { text: "Поставить" });
    const no = ans.createEl("button", { text: "Пропустить" });
    const paint = () => {
      yes.removeClass("sel-yes");
      no.removeClass("sel-no");
      if (this.answers.get(item.id))
        yes.addClass("sel-yes");
      else
        no.addClass("sel-no");
      this.paintDots(dots);
    };
    yes.onclick = () => { this.answers.set(item.id, true); paint(); this.go(1); };
    no.onclick = () => { this.answers.set(item.id, false); paint(); this.go(1); };
    paint();
    const nav = contentEl.createDiv({ cls: "obsimind-wiz-nav" });
    const back = nav.createEl("button", { text: "← Назад" });
    back.disabled = this.idx === 0;
    back.onclick = () => this.go(-1);
    nav.createDiv({ cls: "spacer" });
    const next = nav.createEl("button", { text: this.idx === this.items.length - 1 ? "К итогу →" : "Далее →", cls: "mod-cta" });
    next.onclick = () => this.go(1);
    contentEl.createDiv({
      cls: "obsimind-wiz-hint",
      text: "← → листать · Esc — выйти, ничего не меняя"
    });
  }
  renderSummary() {
    const { contentEl } = this;
    const yesItems = this.items.filter((i) => this.answers.get(i.id));
    const noItems = this.items.filter((i) => !this.answers.get(i.id));
    const head = contentEl.createDiv({ cls: "obsimind-wiz-head" });
    const t = head.createSpan({ text: "Проверь выбор перед установкой" });
    t.style.fontWeight = "600";
    head.createSpan({ cls: "obsimind-wiz-count", text: "итог" });
    contentEl.createDiv({
      cls: "obsimind-wiz-safe",
      text: "Перед каждой перезаписью делается бэкап — откатить можно в любой момент. Пункты с «НЕТ» не скачиваются вообще: твои текущие скрипты и заметки останутся как есть. Личный ключ (config-settings.json) не трогается никогда."
    });
    const table = contentEl.createDiv({ cls: "obsimind-wiz-sumtable" });
    for (const it of this.items) {
      const on = !!this.answers.get(it.id);
      const row = table.createDiv({ cls: "obsimind-wiz-sumrow" });
      row.createSpan({ text: it.icon || (on ? "✓" : "—") });
      row.createSpan({ cls: "nm", text: it.title });
      row.createSpan({ cls: "st " + (on ? "yes" : "no"), text: on ? "ПОСТАВИТЬ" : "пропустить" });
      row.onclick = () => { this.idx = this.items.indexOf(it); this.render(); };
    }
    contentEl.createDiv({
      cls: "obsimind-wiz-hint",
      text: `Ставим: ${yesItems.length} · Пропускаем: ${noItems.length}. Пропущенное можно поставить позже — команда «Что нового / изменить выбор».`
    });
    const nav = contentEl.createDiv({ cls: "obsimind-wiz-nav" });
    const back = nav.createEl("button", { text: "← К изменениям" });
    back.onclick = () => { this.idx = Math.max(0, this.items.length - 1); this.render(); };
    nav.createDiv({ cls: "spacer" });
    const all = nav.createEl("button", { text: "Выбрать всё" });
    all.onclick = () => { this.items.forEach((i) => this.answers.set(i.id, true)); this.render(); };
    const go = nav.createEl("button", {
      text: yesItems.length ? `Установить (${yesItems.length})` : "Ничего не ставить",
      cls: "mod-cta"
    });
    go.onclick = async () => {
      this.close();
      await this.onDone(yesItems.map((i) => i.id), noItems.map((i) => i.id));
    };
  }
};

/* ═══════════ ВЫБОР ВЕРСИИ СИСТЕМЫ ═══════════
   Первое окно после «Начать». Две версии на сервере:
     v0 — мост для тех, кто покупал СТАРЫЙ шаблон: несёт весь каркас новой
          Системы (страницы, тема, плагины, настройки) и убирает старое.
     v1 — актуальная Система для тех, у кого уже новый шаблон: скрипты,
          оформление, плагины Системы. Каркас страниц не перезаписывается.
   Плагин подсказывает, что похоже на твой случай, но решает подписчик. */
var TrackPickModal = class extends import_obsidian.Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
    this.styleEl = null;
    this.choice = "";
  }
  onOpen() {
    this.modalEl.addClass("obsimind-wiz");
    this.styleEl = document.head.createEl("style", { text: WIZARD_CSS });
    const det = this.plugin.detectTrack();
    const s = this.plugin.settings;
    // Мост v0 уже пройден — по умолчанию предлагаем обычную дорожку, чтобы
    // подписчик не завис на старой версии. Выбрать v0 снова можно вручную.
    this.choice = s.track === "old" && s.bridgeDone ? "new" : s.track || det.guess;
    this.render(det);
  }
  onClose() {
    this.contentEl.empty();
    if (this.styleEl)
      this.styleEl.remove();
  }
  /* Экран ожидания: сервер может отвечать несколько секунд. */
  renderWaiting() {
    const { contentEl } = this;
    contentEl.empty();
    const box = contentEl.createDiv({ cls: "obsimind-wiz-wait" });
    box.createDiv({ cls: "obsimind-wiz-spin" });
    box.createDiv({ text: "Смотрю, что нового на сервере…" });
    box.createDiv({ cls: "obsimind-wiz-hint", text: "Обычно это пара секунд" });
  }
  render(det) {
    const { contentEl } = this;
    contentEl.empty();
    const head = contentEl.createDiv({ cls: "obsimind-wiz-head" });
    const t = head.createSpan({ text: "Какая Система у тебя сейчас?" });
    t.style.fontWeight = "600";
    head.createSpan({ cls: "obsimind-wiz-count", text: "шаг 1 из 2" });
    contentEl.createEl("p", {
      cls: "obsimind-wiz-intro",
      text: "От ответа зависит, что тебе привезут: полный каркас новой Системы или только обновление того, что уже есть. Ошибиться не страшно — на следующем шаге ты увидишь каждое изменение отдельно и сможешь отказаться, а после установки всё откатывается одной кнопкой."
    });
    const wrap = contentEl.createDiv({ cls: "obsimind-wiz-choice" });
    const mk = (key, title, tag, lead, bullets) => {
      const b = wrap.createDiv({ cls: "obsimind-wiz-opt" });
      b.setAttribute("role", "radio");
      b.setAttribute("tabindex", "0");
      b.setAttribute("aria-checked", this.choice === key ? "true" : "false");
      b.createDiv({ cls: "obsimind-wiz-mark", text: "✓" });
      const body = b.createDiv();
      const h = body.createDiv({ cls: "h" });
      h.createSpan({ cls: "nm", text: title });
      if (tag)
        h.createSpan({ cls: "tag" + (det.guess === key ? " is-rec" : ""), text: tag });
      body.createEl("p", { text: lead });
      const ul = body.createEl("ul");
      bullets.forEach((x) => ul.createEl("li", { text: x }));
      const pick = () => {
        this.choice = key;
        this.render(det);
      };
      b.onclick = pick;
      b.onkeydown = (ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          pick();
        }
      };
      if (this.choice === key)
        b.addClass("is-sel");
      return b;
    };
    mk(
      "old",
      "Я со старого шаблона",
      det.guess === "old" ? "похоже на твой случай" : "версия v0",
      "Скачивал «База знаний (v1.3. — обн. 10-10-2025).rar» — тот, что в самом низу страницы на Boosty. Так было у всех до 23 мая 2026 года.",
      [
        "Ставится ОДИН раз и уже включает всё из версии для новых — отдельно ничего доставлять не нужно.",
        "Привезёт весь каркас: заготовки заметок, инструкцию, дашборды.",
        "Поставит тему и плагины Системы, донастроит их за тебя.",
        "Выключит (не удалит) старые плагины и уберёт дубли переименованных страниц.",
        "Личные заметки не перезаписываются. Дальше обновляешься вместе со всеми."
      ]
    );
    mk(
      "new",
      "У меня уже новая Система",
      det.guess === "new" ? "похоже на твой случай" : "версия v1",
      "Скачивал «Система.rar» (10,92 Мб) от 23 мая 2026 года — тот, что вверху страницы на Boosty. Нужно просто обновить содержимое до свежего.",
      [
        "Обновит скрипты, оформление, домашнюю страницу и кнопки слева.",
        "Поставит и обновит плагины Системы.",
        "Заготовки заметок и твои страницы НЕ перезаписываются.",
        "Дальше всегда получаешь актуальную версию с сервера."
      ]
    );
    if (det.reasons && det.reasons.length)
      contentEl.createEl("p", {
        cls: "obsimind-wiz-why",
        text: "Почему подсказываю так: " + det.reasons.join("; ") + ". Если считаешь иначе — выбирай сам."
      });
    const nav = contentEl.createDiv({ cls: "obsimind-wiz-nav" });
    const cancel = nav.createEl("button", { text: "Отмена" });
    cancel.onclick = () => this.close();
    nav.createDiv({ cls: "spacer" });
    const go = nav.createEl("button", { text: "Далее — показать изменения →", cls: "mod-cta" });
    go.onclick = async () => {
      this.plugin.settings.track = this.choice;
      // Выбрал переход со старого шаблона — разрешаем прогон на v0 (в том числе
      // повторный, чтобы доставить пропущенные части перехода).
      if (this.choice === "old")
        this.plugin.settings.bridgeDone = false;
      await this.plugin.saveSettings();
      // Ждём сервер прямо в окне, а не пустым уведомлением.
      this.renderWaiting();
      try {
        await this.plugin.installAll();
      } finally {
        this.close();
      }
    };
    contentEl.createDiv({
      cls: "obsimind-wiz-hint",
      text: "Выбор запомнится, но спросят снова при следующем «Начать» — сменить можно в любой момент"
    });
  }
};
var UpdateModal = class extends import_obsidian.Modal {
  constructor(app, changed, onConfirm) {
    super(app);
    this.changed = changed;
    this.onConfirm = onConfirm;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: "\u0412\u044B\u0431\u0435\u0440\u0438, \u0447\u0442\u043E \u043E\u0431\u043D\u043E\u0432\u0438\u0442\u044C" });
    const selected = new Set(this.changed.map((c) => c.name));
    const toolbar = contentEl.createDiv();
    toolbar.style.cssText = "display:flex; gap:8px; margin-bottom:8px;";
    const checkboxes = [];
    const mkToolBtn = (text, on) => {
      const b = toolbar.createEl("button", { text });
      b.onclick = () => {
        selected.clear();
        if (on)
          this.changed.forEach((c) => selected.add(c.name));
        checkboxes.forEach((cb) => cb.checked = on);
      };
    };
    mkToolBtn("\u0412\u0441\u0435", true);
    mkToolBtn("\u041D\u0438\u0447\u0435\u0433\u043E", false);
    const list = contentEl.createDiv();
    list.style.cssText = "max-height:50vh; overflow-y:auto; margin-bottom:12px;";
    for (const c of this.changed) {
      const row = list.createDiv();
      row.style.cssText = "display:flex; align-items:center; gap:8px; padding:4px 2px;";
      const cb = row.createEl("input", { type: "checkbox" });
      cb.checked = true;
      cb.onchange = () => cb.checked ? selected.add(c.name) : selected.delete(c.name);
      checkboxes.push(cb);
      const tag = c.isNew ? "\u{1F195} \u043D\u043E\u0432\u044B\u0439" : "\u267B\uFE0F \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435";
      row.createSpan({ text: `${c.name}` }).style.cssText = "font-weight:600;";
      row.createSpan({ text: tag }).style.cssText = "color:var(--text-muted); font-size:0.85em;";
    }
    const btns = contentEl.createDiv();
    btns.style.cssText = "display:flex; justify-content:flex-end; gap:8px;";
    const cancel = btns.createEl("button", { text: "\u041E\u0442\u043C\u0435\u043D\u0430" });
    cancel.onclick = () => this.close();
    const ok = btns.createEl("button", { text: "\u041E\u0431\u043D\u043E\u0432\u0438\u0442\u044C \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u044B\u0435", cls: "mod-cta" });
    ok.onclick = () => {
      this.close();
      this.onConfirm([...selected]);
    };
  }
  onClose() {
    this.contentEl.empty();
  }
};
var RollbackModal = class extends import_obsidian.Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: "\u0418\u0441\u0442\u043E\u0440\u0438\u044F \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0439 \u2014 \u043E\u0442\u043A\u0430\u0442" });
    const hist = this.plugin.settings.history || [];
    if (!hist.length) {
      contentEl.createEl("p", { text: "\u0418\u0441\u0442\u043E\u0440\u0438\u044F \u043F\u0443\u0441\u0442\u0430 \u2014 \u043E\u0442\u043A\u0430\u0442\u044B\u0432\u0430\u0442\u044C \u043D\u0435\u0447\u0435\u0433\u043E." });
      return;
    }
    contentEl.createEl("p", {
      text: "\u041E\u0442\u043A\u0430\u0442 \u0432\u0435\u0440\u043D\u0451\u0442 \u0444\u0430\u0439\u043B\u044B \u0441\u043A\u0440\u0438\u043F\u0442\u043E\u0432 \u043A \u0432\u0435\u0440\u0441\u0438\u0438 \u0414\u041E \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u043E\u0433\u043E \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u044F. \u041A\u043E\u043D\u0444\u0438\u0433\u0438 \u0438 \u043A\u043B\u044E\u0447\u0438 \u043D\u0435 \u0437\u0430\u0442\u0440\u0430\u0433\u0438\u0432\u0430\u044E\u0442\u0441\u044F."
    }).style.cssText = "color:var(--text-muted); font-size:0.85em;";
    const list = contentEl.createDiv();
    list.style.cssText = "max-height:55vh; overflow-y:auto;";
    [...hist].reverse().forEach((session) => {
      const card = list.createDiv();
      card.style.cssText = "border:1px solid var(--background-modifier-border); border-radius:8px; padding:10px; margin-bottom:8px;";
      const d = new Date(session.time);
      card.createDiv({ text: d.toLocaleString() }).style.cssText = "font-weight:600; margin-bottom:4px;";
      const names = session.items.map((i) => i.name).join(", ");
      card.createDiv({ text: names }).style.cssText = "color:var(--text-muted); font-size:0.85em; margin-bottom:8px;";
      const b = card.createEl("button", { text: "\u21A9\uFE0F \u041E\u0442\u043A\u0430\u0442\u0438\u0442\u044C \u043A \u0432\u0435\u0440\u0441\u0438\u0438 \u0434\u043E \u044D\u0442\u043E\u0433\u043E \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u044F" });
      b.onclick = async () => {
        this.close();
        await this.plugin.rollbackSession(session);
      };
    });
  }
  onClose() {
    this.contentEl.empty();
  }
};
var RestoreAllModal = class extends import_obsidian.Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: "↩️ Вернуть всё назад" });
    const pts = this.plugin.settings.restorePoints || [];
    if (!pts.length) {
      contentEl.createEl("p", { text: "Снимков пока нет. Полный снимок создаётся автоматически перед командой «🚀 Установить / обновить ВСЁ»." });
      return;
    }
    contentEl.createEl("p", {
      text: "Возврат восстановит файлы (скрипты, css, домашнюю, кнопки, заметки, QuickAdd, Commander) из снимка, заново ВКЛЮЧИТ отключённые при установке плагины и ВЫКЛЮЧИТ Obsimind Ecosystem (если его не было). Плагины не удаляются. Личный config-settings.json не трогается."
    }).style.cssText = "color:var(--text-muted); font-size:0.85em; line-height:1.5;";
    const list = contentEl.createDiv();
    list.style.cssText = "max-height:55vh; overflow-y:auto;";
    [...pts].reverse().forEach((rp) => {
      const card = list.createDiv();
      card.style.cssText = "border:1px solid var(--background-modifier-border); border-radius:8px; padding:10px; margin-bottom:8px;";
      const d = new Date(rp.time);
      card.createDiv({ text: `${d.toLocaleString()}${rp.version ? "  ·  " + rp.version : ""}` }).style.cssText = "font-weight:600; margin-bottom:4px;";
      const nFiles = (rp.files || []).length;
      const nPlugins = (rp.reEnablePlugins || []).length;
      card.createDiv({ text: `Файлов в снимке: ${nFiles}; вернуть плагинов: ${nPlugins}` }).style.cssText = "color:var(--text-muted); font-size:0.85em; margin-bottom:8px;";
      const b = card.createEl("button", { text: "↩️ Вернуть всё к этому состоянию", cls: "mod-warning" });
      b.onclick = async () => {
        this.close();
        await this.plugin.revertAll(rp);
      };
    });
  }
  onClose() {
    this.contentEl.empty();
  }
};
/* ── Настройки: минимум. Только ключ и кнопка «Начать».
   Всё остальное (что ставить, а что нет) спрашивает мастер обновлений. ── */
var UPGRADE_CSS = `
/* Колонка по центру области настроек: прижатая влево при широком окне
   выглядела съехавшей. Цвета кнопок не переопределяем — их даёт тема. */
.omu-wrap { display:flex; flex-direction:column; gap:20px; padding:4px 0 16px;
  width:100%; max-width:700px; margin:0 auto; box-sizing:border-box; }
.omu-head { display:flex; align-items:baseline; flex-wrap:wrap; gap:6px 12px; }
.omu-head h2 { margin:0; font-size:1.2em; font-weight:600; color:var(--text-normal); }
.omu-head .sub { color:var(--text-muted); font-size:.88em; }
.omu-head .ver { margin-left:auto; color:var(--text-faint); font-size:.82em; white-space:nowrap; }
.omu-label { font-size:.85em; font-weight:500; color:var(--text-normal); margin-bottom:8px; }
.omu-field { display:flex; gap:8px; }
.omu-field input { flex:1; min-width:0; padding:9px 12px; border-radius:8px; font-size:.92em;
  border:1px solid var(--background-modifier-border); background:var(--background-primary);
  color:var(--text-normal); }
.omu-field input:focus { outline:none; border-color:var(--background-modifier-border-focus); }
.omu-eye { flex:none; width:38px; border-radius:8px; cursor:pointer; font-size:13px;
  border:1px solid var(--background-modifier-border); background:var(--background-primary); color:var(--text-muted); }
.omu-eye:hover { background:var(--background-modifier-hover); }
.omu-status { display:flex; align-items:center; gap:7px; margin-top:9px;
  font-size:.82em; color:var(--text-muted); }
.omu-dot { flex:none; width:6px; height:6px; border-radius:50%; background:var(--text-faint); }
.omu-status.is-ok .omu-dot { background:var(--color-green, #22c55e); }
/* Оформление даёт класс mod-cta самой Obsidian — так кнопка выглядит
   «главной» в любой теме. Здесь только размер и форма. */
.omu-wrap button.omu-go { width:100%; padding:12px 16px; border-radius:9px; cursor:pointer;
  font-size:.98em; font-weight:600; height:auto; white-space:normal; }
.omu-wrap button.omu-go:disabled { cursor:not-allowed; opacity:.45; }
.omu-steps { display:flex; flex-direction:column; gap:9px; }
.omu-step { display:flex; align-items:flex-start; gap:10px;
  font-size:.85em; line-height:1.45; color:var(--text-muted); }
.omu-step .n { flex:none; width:18px; height:18px; margin-top:1px; border-radius:50%;
  display:flex; align-items:center; justify-content:center; font-size:.72em; font-weight:600;
  background:var(--background-modifier-border); color:var(--text-muted); }
.omu-step .t { flex:1; min-width:0; }
.omu-foot { padding-top:14px; border-top:1px solid var(--background-modifier-border);
  font-size:.78em; color:var(--text-faint); line-height:1.5; }
/* Вкладки — в одном стиле с Obsimind Ecosystem. */
.omu-tabs { display:flex; align-items:flex-end; gap:2px; margin:-6px 0 2px;
  border-bottom:2px solid var(--background-modifier-border);
  overflow-x:auto; overflow-y:hidden; scrollbar-width:none; }
.omu-tabs::-webkit-scrollbar { display:none; }
.omu-tab { padding:7px 14px; font-size:14px; font-weight:600; cursor:pointer; white-space:nowrap;
  color:var(--text-muted); border:2px solid transparent; border-bottom:none;
  border-top-left-radius:8px; border-top-right-radius:8px; transition:color .13s, background .13s; }
.omu-tab:hover { color:var(--text-normal); background:var(--background-modifier-hover); }
.omu-tab-on { color:var(--text-normal); transform:translateY(2px);
  border-color:var(--background-modifier-border); border-bottom:2px solid var(--background-primary);
  background:var(--background-primary); }
.omu-body { display:flex; flex-direction:column; gap:20px; }
.omu-card { border:1px solid var(--background-modifier-border); border-radius:10px; padding:13px 15px; }
.omu-card .cap { font-size:.85em; font-weight:600; color:var(--text-normal); margin-bottom:5px; }
.omu-card .note { font-size:.83em; color:var(--text-muted); line-height:1.55; }
.omu-card .note .ln + .ln { margin-top:7px; }
.omu-card .note .ln { overflow-wrap:break-word; }
.omu-link { display:inline-block; margin-top:9px; font-size:1em; font-weight:600; }
.is-mobile .omu-tabs { flex-direction:column; align-items:stretch; border:none; gap:3px; }
.is-mobile .omu-tab { border:none !important; transform:none !important; border-radius:8px;
  padding:10px 12px; background:var(--background-secondary); }
.is-mobile .omu-tab-on { background:var(--background-modifier-hover); }
.omu-back { display:flex; flex-direction:column; gap:9px;
  border:1px solid var(--background-modifier-border); border-radius:10px; padding:13px 15px; }
.omu-back .cap { font-size:.9em; font-weight:600; color:var(--text-normal); }
.omu-back .note { font-size:.78em; color:var(--text-faint); line-height:1.5; }
.omu-back .btns { display:flex; gap:8px; }
.omu-back .btns button { flex:1; min-width:0; padding:9px 10px; border-radius:8px; cursor:pointer; font-size:.88em;
  white-space:normal; line-height:1.35; height:auto;
  border:1px solid var(--background-modifier-border); background:var(--background-primary); color:var(--text-normal); }
.omu-back .btns button:hover:not(:disabled) { background:var(--background-modifier-hover); }
.omu-back .btns button:disabled { opacity:.4; cursor:not-allowed; }
`;
var ObsimindSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.styleEl = null;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    if (!this.styleEl)
      this.styleEl = document.head.createEl("style", { text: UPGRADE_CSS });
    const wrap = containerEl.createDiv({ cls: "omu-wrap" });
    const head = wrap.createDiv({ cls: "omu-head" });
    head.createEl("h2", { text: "ObsiMind Upgrade" });
    head.createSpan({ cls: "sub", text: "обновления шаблона" });
    const ver = this.plugin.settings.installedVersion;
    head.createSpan({ cls: "ver", text: ver ? "установлено " + ver : "ещё не установлено" });
    // Вкладки — как в Obsimind Ecosystem: на первой только «Начать»,
    // объяснения и откат вынесены отдельно, чтобы экран не пугал.
    const TABS = [
      { id: "start", label: "Начать" },
      { id: "help", label: "Инструкция" },
      { id: "back", label: "Откат" }
    ];
    if (!this._tab || !TABS.some((t) => t.id === this._tab))
      this._tab = "start";
    const bar = wrap.createDiv({ cls: "omu-tabs" });
    for (const t of TABS) {
      const el = bar.createDiv({ cls: "omu-tab", text: t.label });
      if (t.id === this._tab)
        el.addClass("omu-tab-on");
      el.onclick = () => {
        this._tab = t.id;
        this.display();
      };
    }
    const body = wrap.createDiv({ cls: "omu-body" });
    if (this._tab === "start")
      this.tabStart(body);
    else if (this._tab === "help")
      this.tabHelp(body);
    else
      this.tabBack(body);
  }
  /* ── Вкладка «Начать»: только ключ и кнопка ── */
  tabStart(wrap) {
    const key = wrap.createDiv();
    key.createDiv({ cls: "omu-label", text: "API ключ" });
    const field = key.createDiv({ cls: "omu-field" });
    const input = field.createEl("input", { type: "password" });
    input.placeholder = "вставь свой ключ подписчика";
    input.value = this.plugin.settings.apiKey || "";
    const eye = field.createEl("button", { cls: "omu-eye", text: "👁" });
    eye.onclick = () => {
      input.type = input.type === "password" ? "text" : "password";
      input.focus();
    };
    const status = key.createDiv({ cls: "omu-status" });
    status.createSpan({ cls: "omu-dot" });
    const statusText = status.createSpan();
    const go = wrap.createEl("button", { cls: "omu-go mod-cta", text: "Начать" });
    const paint = () => {
      const ok = !!input.value.trim();
      status.toggleClass("is-ok", ok);
      statusText.setText(ok ? "Ключ сохранён — можно начинать" : "Без ключа обновление не запустится");
      go.disabled = !ok;
    };
    input.addEventListener("input", async () => {
      this.plugin.settings.apiKey = input.value.trim();
      await this.plugin.saveSettings();
      paint();
    });
    paint();
    go.onclick = () => this.plugin.start();
    wrap.createDiv({
      cls: "omu-foot",
      text: "Дальше плагин спросит, какая Система у тебя сейчас, и покажет каждое изменение отдельно. Ничего не поставится без твоего «ДА». Подробнее — на вкладке «Инструкция»."
    });
  }
  /* ── Вкладка «Инструкция»: как это работает и что будет ── */
  tabHelp(wrap) {
    const steps = wrap.createDiv({ cls: "omu-steps" });
    const mkStep = (n, t) => {
      const s = steps.createDiv({ cls: "omu-step" });
      s.createDiv({ cls: "n", text: String(n) });
      s.createDiv({ cls: "t", text: t });
    };
    mkStep(1, "Вставляешь ключ подписчика на вкладке «Начать» и нажимаешь кнопку.");
    mkStep(2, "Выбираешь свою версию Системы: «я со старого шаблона» или «у меня уже новая». Плагин сам подскажет, что похоже на твой случай.");
    mkStep(3, "Листаешь изменения по одному и на каждое отвечаешь ДА или НЕТ. Отказ ничего не ломает: такие файлы даже не скачиваются.");
    mkStep(4, "Перезапускаешь Obsidian. В хранилище появится заметка «Система обновлена» — там написано, что изменилось.");
    const mkCard = (title, lines, link) => {
      const c = wrap.createDiv({ cls: "omu-card" });
      c.createDiv({ cls: "cap", text: title });
      const box = c.createDiv({ cls: "note" });
      for (const l of [].concat(lines))
        box.createDiv({ cls: "ln", text: l });
      if (link) {
        const a = box.createEl("a", { text: link.text, href: link.href });
        a.addClass("omu-link");
        a.setAttribute("target", "_blank");
      }
    };
    mkCard("Как понять, какой у тебя шаблон", [
      "Посмотри, какой файл ты скачивал на Boosty — по названию всё понятно.",
      "🟡 «База знаний (v1.3. — обн. 10-10-2025).rar», 12,07 Мб — это СТАРЫЙ шаблон. Он лежит в самом низу страницы на Boosty и назывался «упрощённый». Такой шаблон был у всех, кто скачивал до 23 мая 2026 года. Если у тебя он — выбирай «Я со старого шаблона».",
      "🟢 «Система.rar», 10,92 Мб — это НОВЫЙ шаблон, от 23 мая 2026 года. Он в самом верху страницы. Если качал его — выбирай «У меня уже новая Система».",
      "Не помнишь, что качал? Ничего страшного: плагин сам осматривает хранилище и подписывает «похоже на твой случай» у нужной карточки. Ошибиться тоже не страшно — каждое изменение ты подтверждаешь сам, а после установки всё откатывается одной кнопкой."
    ], { text: "Открыть страницу с шаблонами на Boosty", href: "https://boosty.to/elton_labs/posts/04b5460f-a08e-4697-8fb3-6f61e8837291" });
    mkCard("Если у тебя старый шаблон — обновление ставится ОДИН раз", [
      "Тебе не нужно сначала ставить одну версию, потом другую. Версия для старого шаблона (v0) уже включает в себя всё из версии для новых (v1) — и сверху добавляет сам переход: каркас страниц, тему, плагины и уборку старого.",
      "То есть: выбрал «Я со старого шаблона» → прошёл мастер → перезапустил Obsidian → ты уже на актуальной Системе. Версию v1 отдельно ставить НЕ надо — она уже внутри.",
      "Дальше ты обновляешься вместе со всеми: следующее обновление (v2) понадобится каждому — и тем, кто пришёл со старого шаблона, и тем, кто сразу был на новом. Плагин предложит его сам."
    ]);
    mkCard(
      "Что никогда не трогается",
      "Твои личные заметки: дневник, книги, проекты, рецепты. И файл с твоим ключом. Обновление меняет только файлы самой Системы — скрипты, оформление и служебные страницы."
    );
    mkCard(
      "Если чего-то не хватает",
      "Пропущенное можно поставить позже: нажми «Начать» ещё раз — эти пункты предложатся снова, с пометкой «раньше пропустил»."
    );
    mkCard(
      "Куда смотреть после установки",
      "Домашняя страница — начало всего. Полоска иконок слева — быстрый запуск. Страница «Кнопки» — все команды списком. Если поиск по смыслу начнёт выдавать странное, один раз запусти команду «Эмбединг»."
    );
  }
  /* ── Вкладка «Откат» ── */
  tabBack(wrap) {
    const pts = (this.plugin.settings.restorePoints || []).length;
    const hist = (this.plugin.settings.history || []).length;
    const back = wrap.createDiv({ cls: "omu-back" });
    back.createDiv({ cls: "cap", text: "Вернуть всё как было" });
    back.createDiv({
      cls: "note",
      text: pts ? `Перед каждой установкой сохраняется полный снимок хранилища. Сейчас доступно снимков: ${pts}. Возврат восстановит файлы, снова включит выключенные плагины и выключит поставленные. Личный ключ не трогается.` : "Снимок появится после первой установки — тогда здесь можно будет вернуть всё назад одной кнопкой."
    });
    const btns = back.createDiv({ cls: "btns" });
    const bAll = btns.createEl("button", { text: "↩️ Вернуть всё назад" });
    bAll.disabled = !pts;
    bAll.onclick = () => new RestoreAllModal(this.app, this.plugin).open();
    const back2 = wrap.createDiv({ cls: "omu-back" });
    back2.createDiv({ cls: "cap", text: "Отменить одно обновление" });
    back2.createDiv({
      cls: "note",
      text: hist ? `Если сломалось что-то одно — можно вернуть файлы к состоянию до конкретного обновления, не отменяя остальное. Записей в истории: ${hist}.` : "История появится после первого обновления скриптов."
    });
    const btns2 = back2.createDiv({ cls: "btns" });
    const bHist = btns2.createEl("button", { text: "🕘 Выбрать обновление…" });
    bHist.disabled = !hist;
    bHist.onclick = () => new RollbackModal(this.app, this.plugin).open();
    wrap.createDiv({
      cls: "omu-foot",
      text: "Копии старых файлов лежат в папке .obsimind-bak внутри папки скриптов. Даже если удалить плагин, они останутся на месте."
    });
  }
  hide() {
    if (this.styleEl) {
      this.styleEl.remove();
      this.styleEl = null;
    }
    this.containerEl.empty();
  }
};
var FileSuggest = class extends import_obsidian.AbstractInputSuggest {
  constructor(app, inputEl) {
    super(app, inputEl);
    this.input = inputEl;
  }
  getSuggestions(query) {
    const q = query.toLowerCase();
    return this.app.vault.getMarkdownFiles().filter((f) => f.path.toLowerCase().includes(q)).slice(0, 50);
  }
  renderSuggestion(file, el) {
    el.setText(file.path);
  }
  selectSuggestion(file) {
    this.input.value = file.path;
    this.input.trigger("input");
    this.close();
  }
};
var FolderSuggest = class extends import_obsidian.AbstractInputSuggest {
  constructor(app, inputEl) {
    super(app, inputEl);
    this.input = inputEl;
  }
  getSuggestions(query) {
    const q = query.toLowerCase();
    const folders = [];
    for (const f of this.app.vault.getAllLoadedFiles()) {
      if (f instanceof import_obsidian.TFolder && f.path.toLowerCase().includes(q))
        folders.push(f);
    }
    return folders.slice(0, 50);
  }
  renderSuggestion(folder, el) {
    el.setText(folder.path);
  }
  selectSuggestion(folder) {
    this.input.value = folder.path;
    this.input.trigger("input");
    this.close();
  }
};
var FolderPickModal = class extends import_obsidian.Modal {
  constructor(app, current, onPick) {
    super(app);
    this.current = current;
    this.onPick = onPick;
    this.done = false;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: "\u0413\u0434\u0435 \u0442\u0432\u043E\u044F \u043F\u0430\u043F\u043A\u0430 \u0441\u043A\u0440\u0438\u043F\u0442\u043E\u0432?" });
    contentEl.createEl("p", {
      text: `\u041D\u0435 \u043D\u0430\u0448\u0451\u043B \u043F\u0430\u043F\u043A\u0443 \xAB${this.current}\xBB. \u0415\u0441\u043B\u0438 \u0442\u044B \u043F\u0435\u0440\u0435\u0438\u043C\u0435\u043D\u043E\u0432\u0430\u043B \u0438\u043B\u0438 \u043F\u0435\u0440\u0435\u043D\u0451\u0441 \u043F\u0430\u043F\u043A\u0438 \u2014 \u0443\u043A\u0430\u0436\u0438 \u0441\u0432\u043E\u044E \u043D\u0438\u0436\u0435 (\u043D\u0430\u0447\u043D\u0438 \u043F\u0435\u0447\u0430\u0442\u0430\u0442\u044C, \u043F\u043E\u044F\u0432\u044F\u0442\u0441\u044F \u043F\u043E\u0434\u0441\u043A\u0430\u0437\u043A\u0438). \u0415\u0441\u043B\u0438 \u0441\u0442\u0430\u0432\u0438\u0448\u044C \u0441 \u043D\u0443\u043B\u044F \u2014 \u043E\u0441\u0442\u0430\u0432\u044C \u043A\u0430\u043A \u0435\u0441\u0442\u044C, \u043E\u043D\u0430 \u0431\u0443\u0434\u0435\u0442 \u0441\u043E\u0437\u0434\u0430\u043D\u0430.`
    }).style.cssText = "color:var(--text-muted); font-size:0.88em; line-height:1.5;";
    let value = this.current;
    const input = contentEl.createEl("input", { type: "text" });
    input.value = this.current;
    input.placeholder = "\u043D\u0430\u043F\u0440\u0438\u043C\u0435\u0440: 0. Files/4. Templates/Scripts";
    input.style.cssText = "width:100%; box-sizing:border-box; padding:8px 10px; border-radius:8px; border:1px solid var(--background-modifier-border); background:var(--background-primary); color:var(--text-normal); margin:6px 0 12px;";
    new FolderSuggest(this.app, input);
    input.addEventListener("input", () => {
      value = input.value;
    });
    const row = contentEl.createDiv();
    row.style.cssText = "display:flex; gap:8px; justify-content:flex-end;";
    row.createEl("button", { text: "\u041E\u0442\u043C\u0435\u043D\u0430" }).onclick = () => this.close();
    const ok = row.createEl("button", { text: "\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044C", cls: "mod-cta" });
    ok.onclick = () => {
      const v = (value || "").trim().replace(/\/+$/, "");
      if (!v) {
        input.focus();
        return;
      }
      this.done = true;
      this.onPick(v);
      this.close();
    };
    setTimeout(() => input.focus(), 30);
  }
  onClose() {
    this.contentEl.empty();
    if (!this.done)
      this.onPick(null);
  }
};
function pickFolder(app, current) {
  return new Promise((resolve) => new FolderPickModal(app, current, resolve).open());
}
