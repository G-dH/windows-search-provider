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

const ExtensionUtils = imports.misc.extensionUtils;
const MyExtension = ExtensionUtils.getCurrentExtension();
const WindowsSearchProviderModule = MyExtension.imports.windowsSearchProvider.WindowsSearchProviderModule;
const Settings = MyExtension.imports.settings;
const Util = MyExtension.imports.util;

function init() {
    ExtensionUtils.initTranslations();
    return new ESP();
}

class ESP {
    enable() {
        const Me = {};

        // Me.getSettings = ExtensionUtils.getSettings;
        Me.metadata = MyExtension.metadata;
        Me.gSettings = ExtensionUtils.getSettings(Me.metadata['settings-schema']);
        Me.Settings = Settings;
        Me.Util = Util;
        Me.gettext = imports.gettext.domain(Me.metadata['gettext-domain']).gettext;

        Me.opt = new Me.Settings.Options(Me);

        this.Me = Me;

        this._wsp = new WindowsSearchProviderModule(Me);
        this._wsp.update();

        console.debug(`${MyExtension.metadata.name}: enabled`);
    }

    disable() {
        this._wsp.update(true);
        this._wsp.cleanGlobals();
        this.Me.opt.destroy();
        this.Me.opt = null;
        this.Me.Util.cleanGlobals();
        this.Me = null;
        this._esp = null;

        console.debug(`${MyExtension.metadata.name}: disabled`);
    }
}
