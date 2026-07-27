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
    this.addCommand({
      id: "choose-version",
      name: "Выбрать версию Системы (v0 / v1)…",
      callback: () => new TrackPickModal(this.app, this).open()
    });
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
  /* Человеческое описание того, что подписчик получает сейчас — для настроек. */
  trackLabel() {
    if (!this.settings.track)
      return "версия не выбрана";
    if (this.settings.track === "old" && !this.settings.bridgeDone)
      return "переход со старого шаблона (v0)";
    if (this.settings.track === "old" && this.settings.bridgeDone)
      return "переход с v0 выполнен — дальше как у всех";
    return "новая Система (актуальная версия сервера)";
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
            await this.installCore(base, baseUrl, apiKey, sel);
          } else {
            new import_obsidian.Notice("✅ У тебя уже всё актуально — ставить нечего.", 8e3);
          }
          return;
        }
        new UpdateWizardModal(this.app, manifest, pending, this.settings.declinedItems, async (accepted, declined) => {
          const sel = this.buildSelection(manifest, items, accepted, declined);
          await this.installCore(this.filterManifest(manifest, sel), baseUrl, apiKey, sel);
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
    if (!this.settings.track) {
      new TrackPickModal(this.app, this).open();
      return;
    }
    await this.installAll();
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
        await this.installCore(this.filterManifest(manifest, sel), baseUrl, apiKey, sel);
      }).open();
    } catch (e) {
      this.err(e);
    }
  }
  /* ЯДРО установки — прежний код «Установить ВСЁ» из 1.1.0.
     manifest здесь может быть УРЕЗАН под выбор подписчика. */
  async installCore(manifest, baseUrl, apiKey, sel) {
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
      new import_obsidian.Notice(msg, 2e4);
    } catch (e) {
      this.err(e);
    } finally {
      this.running = false;
    }
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
.obsimind-wiz .modal-content { padding: 0; }
.obsimind-wiz-head { display:flex; align-items:center; gap:10px; padding: 2px 2px 14px; }
.obsimind-wiz-ver { font-size:.72em; font-weight:700; letter-spacing:.05em; text-transform:uppercase;
  background: var(--interactive-accent); color: var(--text-on-accent); padding:3px 9px; border-radius:999px; }
.obsimind-wiz-count { margin-left:auto; color: var(--text-muted); font-size:.85em; font-variant-numeric: tabular-nums; }
.obsimind-wiz-dots { display:flex; gap:5px; margin-bottom:14px; }
.obsimind-wiz-dot { flex:1; height:4px; border-radius:2px; background: var(--background-modifier-border);
  transition: background .18s ease; cursor:pointer; }
.obsimind-wiz-dot.is-yes { background: var(--color-green, #22c55e); }
.obsimind-wiz-dot.is-no  { background: var(--text-faint); }
.obsimind-wiz-dot.is-cur { background: var(--interactive-accent); }
.obsimind-wiz-card { border:1px solid var(--background-modifier-border); border-radius:14px;
  padding:18px; background: var(--background-primary-alt); }
.obsimind-wiz-kind { display:inline-block; font-size:.7em; font-weight:700; text-transform:uppercase;
  letter-spacing:.06em; padding:3px 9px; border-radius:999px; margin-bottom:10px;
  background: var(--background-modifier-hover); color: var(--text-muted); }
.obsimind-wiz-title { font-size:1.3em; font-weight:700; line-height:1.25; margin:0 0 6px; }
.obsimind-wiz-rec { font-size:.66em; font-weight:700; color: var(--color-green,#16a34a);
  text-transform:uppercase; letter-spacing:.05em; margin-left:8px; }
.obsimind-wiz-sum { color: var(--text-muted); margin:0 0 14px; line-height:1.5; }
.obsimind-wiz-skip { font-size:.66em; font-weight:700; color: var(--text-faint);
  text-transform:uppercase; letter-spacing:.05em; margin-left:8px; }
.obsimind-wiz-plain { border-left:3px solid var(--interactive-accent); padding:2px 0 2px 12px; margin:0 0 14px; }
.obsimind-wiz-plain h4 { margin:0 0 4px; font-size:.72em; text-transform:uppercase; letter-spacing:.06em;
  color: var(--interactive-accent); font-weight:700; }
.obsimind-wiz-plain p { margin:0; line-height:1.55; font-size:1.02em; }
.obsimind-wiz-intro { color: var(--text-muted); line-height:1.55; margin:0 0 14px; }
.obsimind-wiz-choice { display:flex; flex-direction:column; gap:12px; margin-bottom:6px; }
.obsimind-wiz-opt { text-align:left; width:100%; border:2px solid var(--background-modifier-border);
  border-radius:14px; padding:16px 18px; background: var(--background-primary-alt); cursor:pointer; }
.obsimind-wiz-opt:hover { border-color: var(--background-modifier-border-focus); }
.obsimind-wiz-opt.is-sel { border-color: var(--interactive-accent); background: rgba(99,102,241,.08); }
.obsimind-wiz-opt .h { display:flex; align-items:baseline; gap:8px; font-size:1.12em; font-weight:700;
  margin-bottom:6px; color: var(--text-normal); }
.obsimind-wiz-opt .tag { font-size:.62em; font-weight:700; letter-spacing:.05em; text-transform:uppercase;
  padding:2px 7px; border-radius:999px; background: var(--background-modifier-hover); color: var(--text-muted); }
.obsimind-wiz-opt .tag.is-rec { background: var(--interactive-accent); color: var(--text-on-accent); }
.obsimind-wiz-opt p { margin:0 0 8px; color: var(--text-muted); line-height:1.5; }
.obsimind-wiz-opt ul { margin:0; padding-left:18px; color: var(--text-muted); }
.obsimind-wiz-opt li { margin:2px 0; line-height:1.45; }
.obsimind-wiz-sec { margin-bottom:12px; }
.obsimind-wiz-sec h4 { margin:0 0 5px; font-size:.74em; text-transform:uppercase; letter-spacing:.06em;
  color: var(--text-faint); font-weight:700; }
.obsimind-wiz-sec ul { margin:0; padding-left:18px; }
.obsimind-wiz-sec li { margin:3px 0; line-height:1.45; }
.obsimind-wiz-sec p { margin:0; line-height:1.5; }
.obsimind-wiz-files { font-size:.85em; color: var(--text-muted); margin-top:4px; }
.obsimind-wiz-files summary { cursor:pointer; color: var(--text-faint); }
.obsimind-wiz-answer { display:flex; gap:10px; margin-top:16px; }
.obsimind-wiz-answer button { flex:1; padding:11px 0; border-radius:10px; font-weight:700; cursor:pointer;
  border:2px solid var(--background-modifier-border); background: var(--background-primary); color: var(--text-normal); }
.obsimind-wiz-answer button.sel-yes { border-color: var(--color-green,#22c55e);
  background: rgba(34,197,94,.14); color: var(--color-green,#15803d); }
.obsimind-wiz-answer button.sel-no { border-color: var(--text-faint);
  background: var(--background-modifier-hover); color: var(--text-muted); }
.obsimind-wiz-nav { display:flex; align-items:center; gap:8px; margin-top:14px; }
.obsimind-wiz-nav .spacer { flex:1; }
.obsimind-wiz-hint { color: var(--text-faint); font-size:.78em; text-align:center; margin-top:10px; }
.obsimind-wiz-safe { background: rgba(34,197,94,.08); border:1px solid rgba(34,197,94,.3);
  border-radius:10px; padding:10px 12px; font-size:.85em; color: var(--text-muted);
  margin-bottom:14px; line-height:1.5; }
.obsimind-wiz-sumtable { border:1px solid var(--background-modifier-border); border-radius:12px;
  overflow:hidden; margin-bottom:12px; }
.obsimind-wiz-sumrow { display:flex; align-items:center; gap:10px; padding:9px 12px; cursor:pointer;
  border-bottom:1px solid var(--background-modifier-border); }
.obsimind-wiz-sumrow:last-child { border-bottom:none; }
.obsimind-wiz-sumrow .nm { flex:1; }
.obsimind-wiz-sumrow .st { font-size:.78em; font-weight:700; }
.obsimind-wiz-sumrow .st.yes { color: var(--color-green,#16a34a); }
.obsimind-wiz-sumrow .st.no { color: var(--text-faint); }
`;
var KIND_LABEL = {
  "new": "новое",
  script: "скрипты",
  design: "оформление",
  fix: "починка",
  plugin: "плагины",
  note: "страницы",
  config: "настройки",
  clean: "уборка",
  move: "переезд папок"
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
  /* Честный список: что именно ляжет на диск, если ответить ДА. */
  affectedList(item) {
    const a = item.affects || {};
    const m = this.manifest || {};
    const out = [];
    (a.scripts || []).forEach((s) => out.push("Скрипт: " + s));
    (a.seeds || []).forEach((s) => out.push("Настройки: " + s + " (только если файла ещё нет)"));
    (a.css || []).forEach((s) => out.push("Оформление: snippets/" + s));
    (a.notes || []).forEach((s) => {
      const meta = (m.notes || {})[s];
      const only = !meta || meta.createOnly !== false;
      out.push("Заметка: " + s + (only ? " (только если её нет)" : " (старая уйдёт в копии)"));
    });
    if (a.moc)
      out.push("Домашняя заметка (MOC - HOME)");
    if (a.cmdr)
      out.push("Кнопки Commander (только добавление)");
    (a.integrations || []).forEach((s) => out.push("QuickAdd и кнопка для " + s));
    (a.plugins || []).forEach((s) => out.push("Плагин: " + s));
    if (a.theme && m.theme && m.theme.name)
      out.push(`Тема ${m.theme.name} + станет активной темой`);
    (a.pluginConfigs || []).forEach((s) => out.push("Настройки плагина: " + s + " (с копией прежних)"));
    if (a.removePlugins)
      out.push("Выключит плагины: " + ((m.removePlugins || []).join(", ") || "—"));
    if (a.obsolete)
      (m.obsoleteNotes || []).forEach((s) => out.push("Удалит (с копией): " + s));
    if (a.migrations)
      (m.migrations || []).forEach((x) => out.push(`Перенос: ${x.old} → ${x.neo}`));
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
    head.createSpan({ cls: "obsimind-wiz-ver", text: cl.version || this.manifest.resolvedVersion || "обновление" });
    const t = head.createSpan({ text: cl.title || "Что нового" });
    t.style.fontWeight = "600";
    head.createSpan({ cls: "obsimind-wiz-count", text: `${this.idx + 1} / ${this.items.length}` });
    const dots = contentEl.createDiv({ cls: "obsimind-wiz-dots" });
    this.items.forEach((it, i) => {
      const d = dots.createDiv({ cls: "obsimind-wiz-dot" });
      d.onclick = () => { this.idx = i; this.render(); };
    });
    this.paintDots(dots);
    const card = contentEl.createDiv({ cls: "obsimind-wiz-card" });
    const kind = item.kind || "script";
    card.createDiv({ cls: "obsimind-wiz-kind", text: KIND_LABEL[kind] || kind });
    const title = card.createDiv({ cls: "obsimind-wiz-title" });
    title.createSpan({ text: (item.icon ? item.icon + " " : "") + item.title });
    if (item.recommended !== false)
      title.createSpan({ cls: "obsimind-wiz-rec", text: "рекомендуем" });
    if (this.declinedBefore.has(item.id))
      title.createSpan({ cls: "obsimind-wiz-skip", text: "раньше пропустил" });
    if (item.summary) {
      const s = card.createDiv({ cls: "obsimind-wiz-plain" });
      s.createEl("h4", { text: "Простыми словами" });
      s.createEl("p", { text: item.summary });
    }
    if (item.why) {
      const s = card.createDiv({ cls: "obsimind-wiz-sec" });
      s.createEl("h4", { text: "Зачем это нужно" });
      s.createEl("p", { text: item.why });
    }
    if (item.what && item.what.length) {
      const s = card.createDiv({ cls: "obsimind-wiz-sec" });
      s.createEl("h4", { text: "Что произойдёт" });
      const ul = s.createEl("ul");
      item.what.forEach((w) => ul.createEl("li", { text: w }));
    }
    if (item.how) {
      const s = card.createDiv({ cls: "obsimind-wiz-sec" });
      s.createEl("h4", { text: "Что делать тебе" });
      s.createEl("p", { text: item.how });
    }
    const files = this.affectedList(item);
    if (files.length) {
      const det = card.createEl("details", { cls: "obsimind-wiz-files" });
      det.createEl("summary", { text: `Что будет записано (${files.length})` });
      const ul = det.createEl("ul");
      files.forEach((f) => ul.createEl("li").createEl("code", { text: f }));
    }
    const ans = card.createDiv({ cls: "obsimind-wiz-answer" });
    const yes = ans.createEl("button", { text: "✓ ДА, поставить" });
    const no = ans.createEl("button", { text: "✕ НЕТ, пропустить" });
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
    const toEnd = nav.createEl("button", { text: "Показать итог" });
    toEnd.onclick = () => { this.idx = this.items.length; this.render(); };
    const next = nav.createEl("button", { text: "Далее →", cls: "mod-cta" });
    next.onclick = () => this.go(1);
    contentEl.createDiv({
      cls: "obsimind-wiz-hint",
      text: "← → — листать · клик по полоске — перейти к пункту · Esc — выйти, ничего не меняя"
    });
  }
  renderSummary() {
    const { contentEl } = this;
    const yesItems = this.items.filter((i) => this.answers.get(i.id));
    const noItems = this.items.filter((i) => !this.answers.get(i.id));
    const head = contentEl.createDiv({ cls: "obsimind-wiz-head" });
    head.createSpan({ cls: "obsimind-wiz-ver", text: "итог" });
    const t = head.createSpan({ text: "Проверь выбор перед установкой" });
    t.style.fontWeight = "600";
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
    this.choice = this.plugin.settings.track || det.guess;
    this.render(det);
  }
  onClose() {
    this.contentEl.empty();
    if (this.styleEl)
      this.styleEl.remove();
  }
  render(det) {
    const { contentEl } = this;
    contentEl.empty();
    const head = contentEl.createDiv({ cls: "obsimind-wiz-head" });
    head.createSpan({ cls: "obsimind-wiz-ver", text: "шаг 1 из 2" });
    const t = head.createSpan({ text: "Какая Система у тебя сейчас?" });
    t.style.fontWeight = "600";
    contentEl.createEl("p", {
      cls: "obsimind-wiz-intro",
      text: "Это спрашивается один раз. От ответа зависит, что тебе привезут: полный каркас новой Системы или только обновление того, что уже есть. Ошибиться не страшно — на следующем шаге ты увидишь каждое изменение отдельно и сможешь отказаться, а после установки всё откатывается одной кнопкой."
    });
    const wrap = contentEl.createDiv({ cls: "obsimind-wiz-choice" });
    const mk = (key, title, tag, lead, bullets) => {
      const b = wrap.createEl("button", { cls: "obsimind-wiz-opt" });
      const h = b.createDiv({ cls: "h" });
      h.createSpan({ text: title });
      if (tag)
        h.createSpan({ cls: "tag" + (det.guess === key ? " is-rec" : ""), text: tag });
      b.createEl("p", { text: lead });
      const ul = b.createEl("ul");
      bullets.forEach((x) => ul.createEl("li", { text: x }));
      b.onclick = () => {
        this.choice = key;
        this.render(det);
      };
      if (this.choice === key)
        b.addClass("is-sel");
      return b;
    };
    mk(
      "old",
      "Я со старого шаблона",
      det.guess === "old" ? "похоже на твой случай" : "версия v0",
      "Ты покупал Систему давно и у тебя ещё старый шаблон: другие названия папок, отдельные плагины, нет папки со скриптами. Эта версия переносит тебя на новую Систему за один прогон.",
      [
        "Привезёт весь каркас: заготовки заметок, инструкцию, подсказки, страницы-дашборды.",
        "Поставит тему оформления и все плагины Системы, донастроит их за тебя.",
        "Выключит старые плагины, которые заменила Система (не удалит).",
        "Уберёт дубли переименованных служебных страниц и перенесёт переименованные папки.",
        "Твои личные заметки не перезаписываются. Это разовый переход: дальше обновляешься как все."
      ]
    );
    mk(
      "new",
      "У меня уже новая Система",
      det.guess === "new" ? "похоже на твой случай" : "версия v1",
      "Ты недавно скачал новый шаблон (или уже перешёл на него). Нужно просто обновить содержимое до свежего.",
      [
        "Обновит скрипты, оформление, домашнюю страницу и кнопки слева.",
        "Поставит и обновит плагины Системы.",
        "Заготовки заметок и твои страницы НЕ перезаписываются.",
        "Дальше всегда получаешь актуальную версию с сервера."
      ]
    );
    if (det.reasons && det.reasons.length)
      contentEl.createDiv({
        cls: "obsimind-wiz-safe",
        text: "Почему я так думаю: " + det.reasons.join("; ") + ". Если считаешь иначе — выбирай сам, это твоё решение."
      });
    const nav = contentEl.createDiv({ cls: "obsimind-wiz-nav" });
    const cancel = nav.createEl("button", { text: "Отмена" });
    cancel.onclick = () => this.close();
    nav.createDiv({ cls: "spacer" });
    const go = nav.createEl("button", { text: "Далее — показать изменения →", cls: "mod-cta" });
    go.onclick = async () => {
      const prev = this.plugin.settings.track;
      this.plugin.settings.track = this.choice;
      // Выбрал переход со старого шаблона повторно — снова разрешаем прогон на v0.
      if (this.choice === "old" && prev !== "old")
        this.plugin.settings.bridgeDone = false;
      await this.plugin.saveSettings();
      this.close();
      new import_obsidian.Notice("Смотрю, что нового на сервере…", 4e3);
      await this.plugin.installAll();
    };
    contentEl.createDiv({
      cls: "obsimind-wiz-hint",
      text: "Версию потом можно сменить: команда «Выбрать версию Системы» (Ctrl+P)"
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
.omu-wrap { display:flex; flex-direction:column; gap:22px; padding:4px 0 12px; max-width:640px; }
.omu-head { display:flex; align-items:baseline; gap:12px;
  padding-bottom:14px; border-bottom:1px solid var(--background-modifier-border); }
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
.omu-go { width:100%; padding:11px 0; border-radius:8px; border:none; cursor:pointer;
  font-size:.95em; font-weight:600; color:var(--text-on-accent); background:var(--interactive-accent);
  box-shadow:none; transition:background .12s ease; }
.omu-go:hover:not(:disabled) { background:var(--interactive-accent-hover); }
.omu-go:disabled { cursor:not-allowed; opacity:.4; }
.omu-steps { display:flex; flex-direction:column; gap:9px; }
.omu-step { display:flex; align-items:flex-start; gap:10px;
  font-size:.85em; line-height:1.45; color:var(--text-muted); }
.omu-step .n { flex:none; width:18px; height:18px; margin-top:1px; border-radius:50%;
  display:flex; align-items:center; justify-content:center; font-size:.72em; font-weight:600;
  background:var(--background-modifier-border); color:var(--text-muted); }
.omu-step .t { flex:1; min-width:0; }
.omu-foot { padding-top:14px; border-top:1px solid var(--background-modifier-border);
  font-size:.78em; color:var(--text-faint); line-height:1.5; }
.omu-row { display:flex; align-items:center; gap:10px; font-size:.85em; color:var(--text-muted);
  padding:10px 12px; border:1px solid var(--background-modifier-border); border-radius:8px; }
.omu-row .t { flex:1; min-width:0; }
.omu-row .t b { color:var(--text-normal); font-weight:600; }
.omu-row button { flex:none; padding:6px 12px; border-radius:7px; cursor:pointer; font-size:.95em;
  border:1px solid var(--background-modifier-border); background:var(--background-primary); color:var(--text-normal); }
.omu-row button:hover { background:var(--background-modifier-hover); }
.omu-back { display:flex; flex-direction:column; gap:9px; }
.omu-back .cap { font-size:.85em; font-weight:500; color:var(--text-normal); }
.omu-back .note { font-size:.78em; color:var(--text-faint); line-height:1.5; }
.omu-back .btns { display:flex; gap:8px; }
.omu-back .btns button { flex:1; padding:9px 0; border-radius:8px; cursor:pointer; font-size:.88em;
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
    head.createSpan({ cls: "sub", text: "обновление шаблона в один клик" });
    const ver = this.plugin.settings.installedVersion;
    head.createSpan({ cls: "ver", text: ver ? "установлено " + ver : "ещё не установлено" });
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
    const go = wrap.createEl("button", { cls: "omu-go", text: "Начать" });
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
    const steps = wrap.createDiv({ cls: "omu-steps" });
    const mkStep = (n, t) => {
      const s = steps.createDiv({ cls: "omu-step" });
      s.createDiv({ cls: "n", text: String(n) });
      s.createDiv({ cls: "t", text: t });
    };
    mkStep(1, "Нажимаешь «Начать» — плагин спрашивает, какая Система у тебя сейчас");
    mkStep(2, "Листаешь изменения по одному и на каждое отвечаешь ДА или НЕТ");
    mkStep(3, "Перезапускаешь Obsidian — готово");
    const row = wrap.createDiv({ cls: "omu-row" });
    const rowText = row.createDiv({ cls: "t" });
    rowText.createEl("b", { text: "Версия: " });
    rowText.createSpan({ text: this.plugin.trackLabel() });
    const change = row.createEl("button", { text: this.plugin.settings.track ? "Изменить" : "Выбрать" });
    change.onclick = () => new TrackPickModal(this.app, this.plugin).open();
    const back = wrap.createDiv({ cls: "omu-back" });
    back.createDiv({ cls: "cap", text: "Если что-то пошло не так" });
    const pts = (this.plugin.settings.restorePoints || []).length;
    const hist = (this.plugin.settings.history || []).length;
    back.createDiv({
      cls: "note",
      text: pts ? `Перед каждой установкой сохраняется полный снимок. Доступно снимков: ${pts}. Возврат вернёт файлы, снова включит выключенные плагины и выключит поставленные. Личный ключ не трогается.` : "Снимок появится после первой установки — тогда здесь можно будет вернуть всё назад одной кнопкой."
    });
    const btns = back.createDiv({ cls: "btns" });
    const bAll = btns.createEl("button", { text: "↩️ Вернуть всё назад" });
    bAll.disabled = !pts;
    bAll.onclick = () => new RestoreAllModal(this.app, this.plugin).open();
    const bHist = btns.createEl("button", { text: "🕘 Откатить отдельное обновление" });
    bHist.disabled = !hist;
    bHist.onclick = () => new RollbackModal(this.app, this.plugin).open();
    wrap.createDiv({
      cls: "omu-foot",
      text: "Перед каждой записью делается копия старого файла. Пропущенное в мастере не скачивается вообще — сломать что-то отказом нельзя."
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
