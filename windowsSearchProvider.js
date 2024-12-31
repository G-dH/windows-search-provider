/**
 * WSP (Windows Search Provider)
 * windowsSearchProvider.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2024
 * @license    GPL-3.0
 */

'use strict';

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Highlighter } from 'resource:///org/gnome/shell/misc/util.js';

import * as ListSearchResult from './listSearchResult.js';
import * as DashIcon from './dashIcon.js';

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

export const WindowsSearchProviderModule = class {
    constructor(me) {
        Me = me;
        opt = Me.opt;
        _  = Me._;
        Me.Action = Action;

        ListSearchResult.init(Me);
        this._windowsSearchProvider = null;
        this._enableTimeoutId = 0;
    }

    cleanGlobals() {
        ListSearchResult.cleanGlobals();
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
        Me._overrides = new Me.Util.Overrides();

        // delay to ensure that all default providers are already registered
        let delay = 0;
        if (Main.layoutManager._startingUp)
            delay = 2000;
        this._enableTimeoutId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            delay,
            () => {
                if (!this._windowsSearchProvider) {
                    Me._overrides.addOverride('SearchResultsView', Main.overview._overview.controls._searchController._searchResults, SearchResultsViewOverride);
                    this._windowsSearchProvider = new WindowsSearchProvider();
                    this._registerProvider(this._windowsSearchProvider);
                }
                this._enableTimeoutId = 0;
                return GLib.SOURCE_REMOVE;
            }
        );

        this._dashOpenWindowsIcon = new DashIcon.DashOpenWindowsIcon(Me);
        Me.opt.connect('changed::dash-icon-position', () => this._dashOpenWindowsIcon.updateIcon());

        console.debug('WindowsSearchProviderModule - Activated');
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

        this._dashOpenWindowsIcon.destroy();
        this._dashOpenWindowsIcon = null;

        Me._overrides.removeAll();
        Me._overrides = null;

        console.debug('WindowsSearchProviderModule - Disabled');
    }

    _registerProvider(provider) {
        const searchResults = Main.overview.searchController._searchResults;
        provider.searchInProgress = false;

        // _providers is the source for default result selection, so it has to match the order of displays
        // insert WSP after app search but above all other providers
        let position = 1;
        searchResults._providers.splice(position, 0, provider);

        // create results display and add it to the _content
        searchResults._ensureProviderDisplay.bind(searchResults)(provider);

        // more important is to move the display up in the search view
        // displays are at stable positions and show up when their providers have content to display
        // another way to move our provider up below the applications provider is reloading remote providers
        // searchResults._reloadRemoteProviders()
        searchResults._content.remove_child(provider.display);
        searchResults._content.insert_child_at_index(provider.display, position);
    }

    _unregisterProvider(provider) {
        const searchResults = Main.overview.searchController._searchResults;
        searchResults._unregisterProvider(provider);
    }
};

const WindowsSearchProvider = class WindowsSearchProvider {
    constructor() {
        this.id = Me.providerId;

        // A real appInfo created from a commandline has often issues with overriding get_id() method, so we use dict instead
        this.appInfo = {
            get_name: () => _('Open Windows'),
            get_id: () => 'org.gnome.Nautilus.desktop', // id of an app that is usually installed to avoid error messages
            get_icon: () => Gio.icon_new_for_string('focus-windows-symbolic'),
            should_show: () => true,
            launch: () => {
                Me.Util.openPreferences(Me.metadata);
            },
        };

        this.canLaunchSearch = true;
        this.isRemoteProvider = false;

        this.action = 0;

        this.closeSelectedRegex = /^\/x!$/;
        this.closeAllResultsRegex = /^\/xa!$/;
        this.moveToWsRegex = /^\/m[0-9]+$/;
        this.moveAllToWsRegex = /^\/ma[0-9]+$/;

        this._highlighter = new Highlighter();
    }

    getInitialResultSet(terms/* , cancellable*/) {
        let windows;
        this.windows = windows = {};
        global.display.get_tab_list(Meta.TabList.NORMAL, null).filter(w => w.get_workspace() !== null).map(
            (v, i) => {
                windows[`${i}-${v.get_id()}`] = this.makeResult(v, `${i}-${v.get_id()}`);
                return windows[`${i}-${v.get_id()}`];
            }
        );

        return new Promise(resolve => resolve(this._getResultSet(terms)));
    }

    _getResultSet(terms) {
        const prefixes = [Me.defaultPrefix];
        prefixes.push(...opt.CUSTOM_PREFIXES);

        let prefix;
        for (let p of prefixes) {
            p = new RegExp(`^${p}`, 'i');
            if (p.test(terms[0])) {
                prefix = p;
                break;
            }
        }

        if (!prefix && opt.EXCLUDE_FROM_GLOBAL_SEARCH) {
            const results = [];
            this.resultIds = results.map(item => item.id);
            return this.resultIds;
        }

        this._listAllResults = !!prefix;

        // do not modify original terms
        let _terms = [...terms];
        // search for terms without prefix
        _terms[0] = _terms[0].replace(prefix, '');

        this.action = 0;
        if (opt.COMMANDS_ENABLED) {
            this.targetWs = null;
            this._commandUsed = false;

            const lastTerm = _terms[_terms.length - 1];
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
                _terms.pop();
                if ([Action.MOVE_TO_WS, Action.MOVE_ALL_TO_WS].includes(this.action))
                    this.targetWs = parseInt(lastTerm.replace(/^[^0-9]+/, ''));
            } else if (lastTerm.startsWith('/')) {
                _terms.pop();
            }
        }

        const candidates = this.windows;

        this._terms = _terms;
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

        this._updateHighlights();

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

    getSubsearchResultSet(previousResults, terms) {
        return this.getInitialResultSet(terms);
    }

    // The default highligting is done on terms change
    // but since we are modifying the terms, the highlighting needs to be done after that
    // On first run the result displays are not yet created,
    // so we also need this method to be called from each result display's constructor
    _updateHighlights() {
        const resultIds = this.resultIds;
        // make the highlighter global, so it can be used from the result display
        this._highlighter = new Highlighter(this._terms);
        resultIds.forEach(value => {
            this.display._resultDisplays[value]?._highlightTerms(this);
        });
    }

    launchSearch(terms/* , timeStamp*/) {
        if (this._listAllResults) {
            // launch Extensions app
            this.appInfo.launch();
        } else {
            // update search so all results will be listed
            // Main.overview._overview._controls._searchController._searchResults._reset();
            // Show complete list
            Main.overview._overview.controls._searchEntry.set_text(`${Me.defaultPrefix} ${terms}`);
            // cause an error so the overview will stay open
            this.dummyError();
        }
    }

    activateResult(resultId/* , terms, timeStamp*/) {
        const ctrlPressed = Me.Util.isCtrlPressed();
        const shiftPressed = Me.Util.isShiftPressed();
        const altPressed = Me.Util.isAltPressed();

        if (!this._commandUsed && shiftPressed && !ctrlPressed)
            this.action = Action.MOVE_TO_WS;
        else if (!this._commandUsed && shiftPressed && ctrlPressed)
            this.action = Action.MOVE_ALL_TO_WS;
        else if (!this._commandUsed && altPressed && ctrlPressed && !shiftPressed)
            this.action = Action.CLOSE;

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

        if (ids.length > 1)
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

    createResultObject(meta) {
        const searchResults = Main.overview.searchController._searchResults;
        const lsr = new ListSearchResult.ListSearchResult(this, meta, searchResults);
        return lsr;
    }
};

const SearchResultsViewOverride = {
    _doSearch() {
        this._startingSearch = false;

        let previousResults = this._results;
        this._results = {};

        const selectedProviders = [];
        this._providers.forEach(provider => {
            const prefixes = global.searchProvidersKeywords.get(provider.id);
            if (prefixes) {
                for (let p of prefixes) {
                    p = new RegExp(`^${p}`, 'i');
                    if (p.test(this._terms[0])) {
                        selectedProviders.push(provider.id);
                        break;
                    }
                }
            }
        });

        this._providers.forEach(provider => {
            if (!selectedProviders.length || selectedProviders.includes(provider.id)) {
                let previousProviderResults = previousResults[provider.id];
                this._doProviderSearch(provider, previousProviderResults);
            } else {
                provider.display.visible = false;
            }
        });

        this._updateSearchProgress();
        this._clearSearchTimeout();
    },
};
