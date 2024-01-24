/**
 * WSP (Windows Search Provider)
 * extension.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2023 - 2024
 * @license    GPL-3.0
 *
 */

'use strict';

import * as Extension from 'resource:///org/gnome/shell/extensions/extension.js';

// Me imports
import { WindowsSearchProviderModule } from './windowsSearchProvider.js';
import * as Util from './util.js';

export default class WSP extends Extension.Extension {
    enable() {
        const Me = this;
        Me.Util = Util;
        Me.Util.init(Me);
        Me._ = this.gettext.bind(this);

        this._wsp = new WindowsSearchProviderModule(Me);
        this._wsp.update();

        console.debug(`${this.metadata.name}: enabled`);
    }

    disable() {
        this._wsp.update(true);
        this._wsp.cleanGlobals();
        this.Util.cleanGlobals();
        this.Util = null;
        this._wsp = null;

        console.debug(`${this.metadata.name}: disabled`);
    }
}
