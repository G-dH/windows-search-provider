/**
 * WSP (Windows Search Provider)
 * extension.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2024
 * @license    GPL-3.0
 *
 */

'use strict';

import * as Extension from 'resource:///org/gnome/shell/extensions/extension.js';

// Me imports
import * as Settings from './settings.js';
import { WindowsSearchProviderModule } from './windowsSearchProvider.js';
import * as Util from './util.js';

export default class WSP extends Extension.Extension {
    enable() {
        const Me = {};

        Me.getSettings = this.getSettings.bind(this);
        Me.metadata = this.metadata;
        Me.gSettings = this.getSettings();
        Me.Settings = Settings;
        Me.Util = Util;
        Me.gettext = this.gettext.bind(this);

        Me.opt = new Me.Settings.Options(Me);

        this.Me = Me;

        this._wsp = new WindowsSearchProviderModule(Me);
        this._wsp.update();

        console.debug(`${this.metadata.name}: enabled`);
    }

    disable() {
        this._wsp.update(true);
        this._wsp.cleanGlobals();
        this.Me.opt.destroy();
        this.Me.opt = null;
        this.Me.Util.cleanGlobals();
        this.Me = null;
        this._wsp = null;

        console.debug(`${this.metadata.name}: disabled`);
    }
}
