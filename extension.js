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

const ExtensionUtils = imports.misc.extensionUtils;
const MyExtension = ExtensionUtils.getCurrentExtension();
const WindowsSearchProviderModule = MyExtension.imports.windowsSearchProvider.WindowsSearchProviderModule;
const Util = MyExtension.imports.util;

function init() {
    ExtensionUtils.initTranslations();
    return new ESP();
}

class ESP {
    enable() {
        const Me = MyExtension;
        this.Util = Util;
        this.Util.init(Me);
        this.gettext = imports.gettext.domain(Me.metadata['gettext-domain']).gettext;
        this._ = Me.gettext;

        this._wsp = new WindowsSearchProviderModule(this);
        this._wsp.update();

        console.debug(`${MyExtension.metadata.name}: enabled`);
    }

    disable() {
        this._wsp.update(true);
        this._wsp.cleanGlobals();
        this.Util.cleanGlobals();
        this.Util = null;
        this._wsp = null;

        console.debug(`${MyExtension.metadata.name}: disabled`);
    }
}
