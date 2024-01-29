/**
 * WSP (Windows Search Provider)
 * windowsSearchProvider.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2023 - 2024
 * @license    GPL-3.0
 */

'use strict';

const  { GLib, Gio, GObject, Clutter, Meta, Shell, St } = imports.gi;

const Main = imports.ui.main;
const Search = imports.ui.search;

const Action = {
    NONE: 0,
    CLOSE: 1,
    CLOSE_ALL: 2,
    MOVE_TO_WS: 3,
    MOVE_ALL_TO_WS: 4,
};

let Me;
let opt;
// gettext
let _;
let _toggleTimeout;

// prefix helps to eliminate results from other search providers
// so it needs to be something less common
const PREFIX = 'wq//';

var WindowsSearchProviderModule = class {
    constructor(me) {
        Me = me;
        opt = Me.opt;
        _  = Me.gettext;

        this._firstActivation = true;
        this.moduleEnabled = false;
        this._windowsSearchProvider = null;
        this._enableTimeoutId = 0;
    }

    cleanGlobals() {
        Me = null;
        opt = null;
        _ = null;
    }

    update(reset) {
        if (_toggleTimeout) {
            GLib.source_remove(_toggleTimeout);
            _toggleTimeout = 0;
        }

        if (reset)
            this._disableModule();
        else if (!reset)
            this._activateModule();
    }

    _activateModule() {
        this._overrides = new Me.Util.Overrides();
        this._overrides.addOverride('SearchResult', Search.SearchResult.prototype, SearchResultOverride);

        // GNOME 43/44 has a problem registering a new provider during Shell's startup
        let delay = 0;
        if (Main.layoutManager._startingUp)
            delay = 2000;
        this._enableTimeoutId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            delay,
            () => {
                if (!this._windowsSearchProvider) {
                    this._windowsSearchProvider = new WindowsSearchProvider();
                    this._registerProvider(this._windowsSearchProvider);
                }
                this._enableTimeoutId = 0;
                return GLib.SOURCE_REMOVE;
            }
        );

        console.debug('  WindowsSearchProviderModule - Activated');
    }

    _disableModule() {
        if (this._enableTimeoutId) {
            GLib.source_remove(this._enableTimeoutId);
            this._enableTimeoutId = 0;
        }
        if (this._windowsSearchProvider) {
            this._unregisterProvider(this._windowsSearchProvider);
            this._windowsSearchProvider = null;
        }

        this._overrides.removeAll();
        this._overrides = null;

        console.debug('  WindowsSearchProviderModule - Disabled');
    }

    _registerProvider(provider) {
        const searchResults = Main.overview._overview.controls._searchController._searchResults;
        provider.searchInProgress = false;

        // insert WSP after app search but above all other providers
        searchResults._providers.splice(1, 0, provider);

        // create results display and add it to the _content
        searchResults._ensureProviderDisplay.bind(searchResults)(provider);

        // more important is to move the display up in the search view
        // displays are at stable positions and show up when their providers have content to display
        // another way to move our provider up below the applications provider is reloading remote providers
        // searchResults._reloadRemoteProviders()
        searchResults._content.remove_child(provider.display);
        searchResults._content.insert_child_at_index(provider.display, 1);
    }

    _unregisterProvider(provider) {
        const searchResults = Main.overview._overview.controls._searchController._searchResults;
        searchResults._unregisterProvider(provider);
    }
};

const WindowsSearchProvider = class WindowsSearchProvider {
    constructor() {
        this.id = 'open-windows';

        const appInfo = Gio.AppInfo.create_from_commandline('/usr/bin/gnome-extensions-app', 'Extensions', null);
        appInfo.get_description = () => _('Search open windows');
        appInfo.get_name = () => _('Open Windows');
        appInfo.get_id = () => 'org.gnome.Extensions.desktop';
        appInfo.get_icon = () => Gio.icon_new_for_string('focus-windows-symbolic');
        appInfo.should_show = () => true;

        this.appInfo = appInfo;
        this.canLaunchSearch = true;
        this.isRemoteProvider = false;

        this.action = 0;

        this.closeSelectedRegex = /^\/x!$/;
        this.closeAllResultsRegex = /^\/xa!$/;
        this.moveToWsRegex = /^\/m[0-9]+$/;
        this.moveAllToWsRegex = /^\/ma[0-9]+$/;
    }

    getInitialResultSet(terms, callback, cancellable) {
        // In GS 43 callback arg has been removed
        /* if (shellVersion >= 43)
            cancellable = callback;*/

        let windows;
        this.windows = windows = {};
        global.display.get_tab_list(Meta.TabList.NORMAL, null).filter(w => w.get_workspace() !== null).map(
            (v, i) => {
                windows[`${i}-${v.get_id()}`] = this.makeResult(v, `${i}-${v.get_id()}`);
                return windows[`${i}-${v.get_id()}`];
            }
        );

        if (cancellable === undefined)
            return new Promise(resolve => resolve(this._getResultSet(terms)));
        else
            callback(this._getResultSet(terms));

        return null;
    }

    _getResultSet(terms) {
        const prefixes = [PREFIX];
        prefixes.push(...opt.CUSTOM_PREFIXES);

        let prefix;
        for (let p of prefixes) {
            p = new RegExp(`^${p}`, 'i');
            if (p.test(terms[0])) {
                prefix = p;
                break;
            }
        }

        if (!prefix && opt.EXCLUDE_FROM_GLOBAL_SEARCH)
            return new Map();

        this._listAllResults = !!prefix;

        // do not modify original terms
        let termsCopy = [...terms];
        // search for terms without prefix
        termsCopy[0] = termsCopy[0].replace(prefix, '');

        if (opt.COMMANDS_ENABLED) {
            this.action = 0;
            this.targetWs = null;
            this._commandUsed = false;

            const lastTerm = termsCopy[termsCopy.length - 1];
            if (lastTerm.match(this.closeSelectedRegex))
                this.action = Action.CLOSE;
            else if (lastTerm.match(this.closeAllResultsRegex))
                this.action = Action.CLOSE_ALL;
            else if (lastTerm.match(this.moveToWsRegex))
                this.action = Action.MOVE_TO_WS;
            else if (lastTerm.match(this.moveAllToWsRegex))
                this.action = Action.MOVE_ALL_TO_WS;

            if (this.action) {
                this._commandUsed = true;
                termsCopy.pop();
                if ([Action.MOVE_TO_WS, Action.MOVE_ALL_TO_WS].includes(this.action))
                    this.targetWs = parseInt(lastTerm.replace(/^[^0-9]+/, ''));
            } else if (lastTerm.startsWith('/')) {
                termsCopy.pop();
            }
        }

        const candidates = this.windows;
        const _terms = [].concat(termsCopy);

        const term = _terms.join(' ').trim();

        const results = [];
        let m;
        for (let key in candidates) {
            if (opt.STRICT_MATCH) {
                m = Me.Util.strictMatch(term, candidates[key].name);
            } else if (opt.FUZZY_MATCH) {
                m = Me.Util.fuzzyMatch(term, candidates[key].name);
            } else { // if opt.REG_EXP_MATCH
                m = Me.Util.regexpMatch(term, candidates[key].name, opt.REG_EXP_INSENSITIVE_MATCH ? 'i' : '');
            }

            if (m !== -1)
                results.push({ weight: m, id: key });
        }

        results.sort((a, b) => a.weight > b.weight);
        const currentWs = global.workspace_manager.get_active_workspace_index();

        switch (opt.RESULTS_ORDER) {
        case 1: // MRU - current ws first*/
            results.sort((a, b) => (this.windows[a.id].window.get_workspace().index() !== currentWs) && (this.windows[b.id].window.get_workspace().index() === currentWs));
            break;
        case 2: // MRU - by workspace
            results.sort((a, b) => this.windows[a.id].window.get_workspace().index() > this.windows[b.id].window.get_workspace().index());
            break;
        case 3: // Stable sequence - by workspace
            results.sort((a, b) => this.windows[a.id].window.get_stable_sequence() > this.windows[b.id].window.get_stable_sequence());
            results.sort((a, b) => this.windows[a.id].window.get_workspace().index() > this.windows[b.id].window.get_workspace().index());
            break;
        }

        results.sort((a, b) => (_terms !== ' ') && (a.weight > 0 && b.weight === 0));
        this.resultIds = results.map(item => item.id);
        return this.resultIds;
    }

    getResultMetas(resultIds, callback, cancellable) {
        const metas = resultIds.map(id => this.getResultMeta(id));
        if (cancellable === undefined)
            return new Promise(resolve => resolve(metas));
        else if (callback)
            callback(metas);
        return null;
    }

    getResultMeta(resultId) {
        const result = this.windows[resultId];
        const wsIndex = result.window.get_workspace().index();
        const app = Shell.WindowTracker.get_default().get_window_app(result.window);
        return {
            'id': resultId,
            'name': `${wsIndex + 1}: ${result.windowTitle}`,
            'description': result.appName,
            'createIcon': size => {
                return app
                    ? app.create_icon_texture(size)
                    : new St.Icon({ icon_name: 'icon-missing', icon_size: size });
            },
        };
    }

    makeResult(window, i) {
        const app = Shell.WindowTracker.get_default().get_window_app(window);
        const appName = app ? app.get_name() : 'Unknown';
        const windowTitle = window.get_title();
        const wsIndex = window.get_workspace().index();

        return {
            'id': i,
            'name': `${wsIndex + 1}: ${windowTitle} ${appName}`,
            appName,
            windowTitle,
            window,
        };
    }

    filterResults(results, maxResults) {
        return this._listAllResults
            ? results
            : results.slice(0, maxResults);
    }

    getSubsearchResultSet(previousResults, terms, callback, cancellable) {
        if (cancellable === undefined) {
            return this.getInitialResultSet(terms, cancellable);
        } else {
            this.getInitialResultSet(terms, callback, cancellable);
            return null;
        }
    }

    launchSearch(terms, timeStamp) {
        if (this._listAllResults) {
            // launch Extensions app
            this.appInfo.launch([], global.create_app_launch_context(timeStamp, -1), null);
        } else {
            // update search so all results will be listed
            // Main.overview._overview._controls._searchController._searchResults._reset();
            Main.overview._overview.controls._searchEntry.set_text(`${PREFIX} ${terms}`);
            // cause an error so the overview will stay open
            this.dummyError();
        }
    }

    activateResult(resultId/* , terms, timeStamp*/) {
        const ctrlPressed = Me.Util.isCtrlPressed();
        const shiftPressed = Me.Util.isShiftPressed();

        if (!this._commandUsed && shiftPressed && !ctrlPressed)
            this.action = Action.MOVE_TO_WS;
        else if (!this._commandUsed && shiftPressed && ctrlPressed)
            this.action = Action.MOVE_ALL_TO_WS;

        if (!this.action) {
            const result = this.windows[resultId];
            Main.activateWindow(result.window);
            return;
        }

        switch (this.action) {
        case Action.CLOSE:
            this._closeWindows([resultId]);
            break;
        case Action.CLOSE_ALL:
            this._closeWindows(this.resultIds);
            break;
        case Action.MOVE_TO_WS:
            this._moveWindowsToWs(resultId, [resultId]);
            break;
        case Action.MOVE_ALL_TO_WS:
            this._moveWindowsToWs(resultId, this.resultIds);
            break;
        }
    }

    _closeWindows(ids) {
        let time = global.get_current_time();
        for (let i = 0; i < ids.length; i++)
            this.windows[ids[i]].window.delete(time + i);

        Main.notify('Window Search Provider', `Closed ${ids.length} windows.`);
    }

    _moveWindowsToWs(selectedId, resultIds) {
        const workspace = this.targetWs
            ? global.workspaceManager.get_workspace_by_index(this.targetWs - 1)
            : global.workspaceManager.get_active_workspace();

        for (let i = 0; i < resultIds.length; i++)
            this.windows[resultIds[i]].window.change_workspace(workspace);

        if (!Me.Util.isAltPressed()) {
            const selectedWin = this.windows[selectedId].window;
            workspace.activate(global.get_current_time());
            selectedWin.activate(global.get_current_time());
        }
    }
};

const SearchResultOverride = {
    activate() {
        this.provider.activateResult(this.metaInfo.id, this._resultsView.terms);

        if (this.metaInfo.clipboardText) {
            St.Clipboard.get_default().set_text(
                St.ClipboardType.CLIPBOARD, this.metaInfo.clipboardText);
        }
        // Hold Alt to avoid leaving the overview
        // this works for actions that don't involve a window activation which closes the overview too
        if (!Me.Util.isAltPressed())
            Main.overview.toggle();
    },
};
