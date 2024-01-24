/**
 * WSP (Windows Search Provider)
 * windowsSearchProvider.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2023 - 2024
 * @license    GPL-3.0
 */

'use strict';

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const Action = {
    NONE: 0,
    CLOSE: 1,
    CLOSE_ALL: 2,
    MOVE_TO_WS: 3,
    MOVE_ALL_TO_WS: 4,
};

let Me;
// let opt;
// gettext
let _;
let _toggleTimeout;

// prefix helps to eliminate results from other search providers
// so it needs to be something less common
const PREFIXES = ['wq//', 'qqw', '`', ';', '|'];

export const WindowsSearchProviderModule = class {
    constructor(me) {
        Me = me;
        // opt = Me.opt;
        _  = Me._;

        this._firstActivation = true;
        this.moduleEnabled = false;
        this._windowsSearchProvider = null;
        this._enableTimeoutId = 0;
    }

    cleanGlobals() {
        Me = null;
        // opt = null;
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
                    this._getOverviewSearchResult()._registerProvider(this._windowsSearchProvider);
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
            this._getOverviewSearchResult()._unregisterProvider(this._windowsSearchProvider);
            this._windowsSearchProvider = null;
        }

        console.debug('  WindowsSearchProviderModule - Disabled');
    }

    _getOverviewSearchResult() {
        return Main.overview._overview.controls._searchController._searchResults;
    }
};

/* const closeSelectedRegex = /^\/x!$/;
const closeAllResultsRegex = /^\/xa!$/;
const moveToWsRegex = /^\/m[0-9]+$/;
const moveAllToWsRegex = /^\/ma[0-9]+$/;*/

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
        let prefix;
        for (let p of PREFIXES) {
            if (terms[0].startsWith(p)) {
                prefix = p;
                break;
            }
        }
        this._listAllResults = !!prefix;
        // do not modify original terms
        let termsCopy = [...terms];
        // search for terms without prefix
        termsCopy[0] = termsCopy[0].replace(prefix, '');

        /* if (gOptions.get('searchWindowsCommands')) {
            this.action = 0;
            this.targetWs = 0;

            const lastTerm = terms[terms.length - 1];
            if (lastTerm.match(closeSelectedRegex)) {
                this.action = Action.CLOSE;
            } else if (lastTerm.match(closeAllResultsRegex)) {
                this.action = Action.CLOSE_ALL;
            } else if (lastTerm.match(moveToWsRegex)) {
                this.action = Action.MOVE_TO_WS;
            } else if (lastTerm.match(moveAllToWsRegex)) {
                this.action = Action.MOVE_ALL_TO_WS;
            }
            if (this.action) {
                terms.pop();
                if (this.action === Action.MOVE_TO_WS || this.action === Action.MOVE_ALL_TO_WS) {
                    this.targetWs = parseInt(lastTerm.replace(/^[^0-9]+/, '')) - 1;
                }
            } else if (lastTerm.startsWith('/')) {
                terms.pop();
            }
        }*/

        const candidates = this.windows;
        const _terms = [].concat(termsCopy);
        // let match;

        const term = _terms.join(' ');
        /* match = s => {
            return fuzzyMatch(term, s);
        }; */

        const results = [];
        let m;
        for (let key in candidates) {
            /* if (opt.SEARCH_FUZZY)
                m = Me.Util.fuzzyMatch(term, candidates[key].name);
            else*/
            m = Me.Util.strictMatch(term, candidates[key].name);
            if (m !== -1)
                results.push({ weight: m, id: key });
        }

        results.sort((a, b) => a.weight > b.weight);
        const currentWs = global.workspace_manager.get_active_workspace_index();
        // prefer current workspace
        /* switch (opt.WINDOW_SEARCH_ORDER) {
        case 1: // MRU - current ws first*/
        results.sort((a, b) => (this.windows[a.id].window.get_workspace().index() !== currentWs) && (this.windows[b.id].window.get_workspace().index() === currentWs));
        /*    break;
        case 2: // MRU - by workspace
            results.sort((a, b) => this.windows[a.id].window.get_workspace().index() > this.windows[b.id].window.get_workspace().index());
            break;
        case 3: // Stable sequence - by workspace
            results.sort((a, b) => this.windows[a.id].window.get_stable_sequence() > this.windows[b.id].window.get_stable_sequence());
            results.sort((a, b) => this.windows[a.id].window.get_workspace().index() > this.windows[b.id].window.get_workspace().index());
            break;
        }*/

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
            // convert all accented chars to their basic form and lower case for search
            'name': `${wsIndex + 1}: ${windowTitle} ${appName}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(),
            appName,
            windowTitle,
            window,
        };
    }

    launchSearch(terms/* , timeStamp*/) {
        Main.overview._overview._controls._searchController._searchResults._reset();
        Main.overview._overview.controls._searchEntry.set_text(`${PREFIXES[0]} ${terms}`);
        // cause an error so the overview will stay open
        this.dummyError();
    }

    activateResult(resultId/* , terms, timeStamp*/) {
        const isCtrlPressed = Me.Util.isCtrlPressed();
        const isShiftPressed = Me.Util.isShiftPressed();

        this.action = 0;
        this.targetWs = 0;

        this.targetWs = global.workspaceManager.get_active_workspace().index() + 1;
        if (isShiftPressed && !isCtrlPressed)
            this.action = Action.MOVE_TO_WS;
        else if (isShiftPressed && isCtrlPressed)
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
        const workspace = global.workspaceManager.get_active_workspace();

        for (let i = 0; i < resultIds.length; i++)
            this.windows[resultIds[i]].window.change_workspace(workspace);

        const selectedWin = this.windows[selectedId].window;
        selectedWin.activate_with_workspace(global.get_current_time(), workspace);
    }

    filterResults(results, maxResults) {
        return this._listAllResults
            ? results
            : results.slice(0, maxResults);
    }

    getSubsearchResultSet(previousResults, terms) {
        return this.getInitialResultSet(terms);
    }
};
