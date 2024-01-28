/**
 * WSM - Workspace Switcher Manager
 * prefs.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 - 2024
 * @license    GPL-3.0
 */

'use strict';

import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import * as Settings from './settings.js';
import * as OptionsFactory from './optionsFactory.js';

// gettext
let _;

export default class ESP extends ExtensionPreferences {
    _getPageList() {
        const itemFactory = new OptionsFactory.ItemFactory();
        const pageList = [
            {
                name: 'general',
                title: _('Options'),
                iconName: 'open-menu-symbolic',
                optionList: this._getGeneralOptionList(itemFactory),
            },
            {
                name: 'about',
                title: _('About'),
                iconName: 'preferences-system-details-symbolic',
                optionList: this._getAboutOptionList(itemFactory),
            },
        ];

        return pageList;
    }

    fillPreferencesWindow(window) {
        this.Me = {};
        this.Me.Settings = Settings;

        this.Me.gSettings = this.getSettings();
        this.Me.gettext = this.gettext.bind(this);
        _ = this.Me.gettext;
        this.Me.metadata = this.metadata;

        this.opt = new this.Me.Settings.Options(this.Me);
        this.Me.opt = this.opt;

        OptionsFactory.init(this.Me);

        window = new OptionsFactory.AdwPrefs(this.opt).getFilledWindow(window, this._getPageList());
        window.connect('close-request', () => {
            this.opt.destroy();
            this.opt = null;
            this.Me = null;
            _ = null;
        });

        window.set_default_size(840, 800);
    }


    // ////////////////////////////////////////////////////////////////////

    _getGeneralOptionList(itemFactory) {
        const optionList = [];

        optionList.push(
            itemFactory.getRowWidget(
                ''/* _('Options')*/
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Custom Search Prefixes'),
                _('Strings separated by space. The search prefix is a character/string added in front of the searched pattern (optionally followed by a space), serving as both a blocker for other search providers and a command to WSP to list all results instead of the default, limited to 5 results. The default fixed search prefix is "wq//"'),
                itemFactory.newEditableEntry(),
                'customPrefixes'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Enable Fuzzy Match'),
                _('Enabling the fuzzy match allows you to skip letters in the pattern you are searching for and find "V-Shell" even if you enter "vll"'),
                itemFactory.newSwitch(),
                'fuzzyMatch'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Exclude Results From Global Search'),
                _('Show results only if a search prefix is used, so that WSP results do not clutter the global search'),
                itemFactory.newSwitch(),
                'excludeFromGlobalSearch'
            )
        );

        optionList.push(
            itemFactory.getRowWidget(
                _('Sorting'),
                _('Order of windows in the complete list when using a search prefix alone'),
                itemFactory.newDropDown(),
                'resultsOrder',
                [
                    [_('Most Recently Used (MRU)'), 0],
                    [_('MRU - Current Workspace First'), 1],
                    [_('MRU - By Workspaces'), 2],
                    [_('Stable Sequence - By Workspaces'), 3],
                ]
            )
        );

        /* optionList.push(
            itemFactory.getRowWidget(
                _('WSP Icon Position'),
                _('Allows to add "Search Open Windows" icon into Dash so you can directly toggle extensions search provider results'),
                itemFactory.newDropDown(),
                'dashIconPosition',
                [
                    [_('Hide'), 0],
                    [_('Start'), 1],
                    [_('End'), 2],
                ]
            )
        );*/

        return optionList;
    }

    _getAboutOptionList(itemFactory) {
        const optionList = [];

        optionList.push(itemFactory.getRowWidget(
            this.Me.metadata.name
        ));

        const versionName = this.Me.metadata['version-name'] ?? '';
        let version = this.Me.metadata['version'] ?? '';
        version = versionName && version ? `/${version}` : version;
        const versionStr = `${versionName}${version}`;
        optionList.push(itemFactory.getRowWidget(
            _('Version'),
            null,
            itemFactory.newLabel(versionStr)
        ));

        optionList.push(itemFactory.getRowWidget(
            _('Reset all options'),
            _('Set all options to default values.'),
            itemFactory.newOptionsResetButton()
        ));


        optionList.push(itemFactory.getRowWidget(
            _('Links')
        ));

        optionList.push(itemFactory.getRowWidget(
            _('Homepage'),
            _('Source code and more info about this extension'),
            itemFactory.newLinkButton('https://github.com/G-dH/windows-search-provider')
        ));

        /* optionList.push(itemFactory.getRowWidget(
            _('Changelog'),
            _("See what's changed."),
            itemFactory.newLinkButton('https://github.com/G-dH/windows-search-provider/blob/main/CHANGELOG.md')
        ));*/

        optionList.push(itemFactory.getRowWidget(
            _('GNOME Extensions'),
            _('Rate and comment V-Shell on the GNOME Extensions site'),
            itemFactory.newLinkButton('https://extensions.gnome.org/extension/6730')
        ));

        optionList.push(itemFactory.getRowWidget(
            _('Report a bug or suggest new feature'),
            _('Help me to help you!'),
            itemFactory.newLinkButton('https://github.com/G-dH/windows-search-provider/issues')
        ));

        optionList.push(itemFactory.getRowWidget(
            _('Buy Me a Coffee'),
            _('If you like ESP, you can help me with my coffee expenses'),
            itemFactory.newLinkButton('https://buymeacoffee.com/georgdh')
        ));

        return optionList;
    }
}
