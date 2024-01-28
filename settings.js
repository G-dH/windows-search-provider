/**
 * WSM - Workspace Switcher Manager
 * settings.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 - 2024
 * @license    GPL-3.0
 */

'use strict';

const GLib = imports.gi.GLib;

var Options = class Options {
    constructor(me) {
        this.Me = me;

        this._gsettings = this.Me.gSettings;
        this._connectionIds = [];
        this._writeTimeoutId = 0;
        this._gsettings.delay();
        this.connect('changed', () => {
            if (this._writeTimeoutId)
                GLib.Source.remove(this._writeTimeoutId);

            this._writeTimeoutId = GLib.timeout_add(
                GLib.PRIORITY_DEFAULT,
                400,
                () => {
                    this._gsettings.apply();
                    this._updateCachedSettings();
                    this._writeTimeoutId = 0;
                    return GLib.SOURCE_REMOVE;
                }
            );
        });

        this.options = {
            customPrefixes:          ['string', 'custom-prefixes'],
            excludeFromGlobalSearch: ['boolean', 'exclude-from-global-search'],
            resultsOrder:            ['int', 'results-order'],
            fuzzyMatch:              ['boolean', 'fuzzy-match'],
            dashIconPosition:        ['int', 'dash-icon-position'],
        };

        this.cachedOptions = {};

        this._setOptionConstants();
    }

    _updateCachedSettings(/* settings, key */) {
        Object.keys(this.options).forEach(v => this.get(v, true));
        this._setOptionConstants();
    }

    get(option, updateCache = false) {
        if (updateCache || this.cachedOptions[option] === undefined) {
            const [, key, settings] = this.options[option];
            let gSettings;
            if (settings !== undefined)
                gSettings = settings();
            else
                gSettings = this._gsettings;


            this.cachedOptions[option] = gSettings.get_value(key).deep_unpack();
        }

        return this.cachedOptions[option];
    }

    set(option, value) {
        const [format, key] = this.options[option];
        switch (format) {
        case 'string':
            this._gsettings.set_string(key, value);
            break;
        case 'int':
            this._gsettings.set_int(key, value);
            break;
        case 'boolean':
            this._gsettings.set_boolean(key, value);
            break;
        }
    }

    getDefault(option) {
        const [, key] = this.options[option];
        return this._gsettings.get_default_value(key).deep_unpack();
    }

    connect(name, callback) {
        const id = this._gsettings.connect(name, callback);
        this._connectionIds.push(id);
        return id;
    }

    destroy() {
        this._connectionIds.forEach(id => this._gsettings.disconnect(id));
        if (this._writeTimeoutId)
            GLib.Source.remove(this._writeTimeoutId);
        this._writeTimeoutId = 0;
        this._gsettings = null;
    }

    _setOptionConstants() {
        const REGEXP_SPECIAL_CHAR        = /[!#$%^&*)(+=.<>{}[\]:;'"|~`_-]/g;
        this.CUSTOM_PREFIXES             = this.get('customPrefixes').replace(REGEXP_SPECIAL_CHAR, '\\$&').split(' ');
        this.RESULTS_ORDER               = this.get('resultsOrder');
        this.EXCLUDE_FROM_GLOBAL_SEARCH  = this.get('excludeFromGlobalSearch');
        this.FUZZY                       = this.get('fuzzyMatch');
        this.DASH_ICON_POSITION          = this.get('dashIconPosition');
        this.DASH_ICON_HIDEN             = !this.DASH_ICON_POSITION;
    }
};
