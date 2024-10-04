/**
 * WSP (Windows Search Provider)
 * listSearchResult.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2024
 * @license    GPL-3.0
 */

'use strict';

import Atk from 'gi://Atk';
import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

let Me;
let opt;
let _;
let timeout;

export function init(me) {
    Me = me;
    _ = Me._;
    opt = Me.opt;
}

export function cleanGlobals() {
    Me = null;
    _ = null;
    opt = null;
    if (timeout) {
        GLib.source_remove(timeout);
        timeout = 0;
    }
}

export const ListSearchResult = GObject.registerClass({
    GTypeName: `ListSearchResult${Math.floor(Math.random() * 1000)}`,
}, class ListSearchResult extends St.Button {
    _init(provider, metaInfo, searchResults) {
        this.provider = provider;
        this.metaInfo = metaInfo;
        this.searchResults = searchResults;

        super._init({
            reactive: true,
            can_focus: true,
            track_hover: true,
        });

        this.style_class = 'list-search-result wsp-list-search-result';

        let content = new St.BoxLayout({
            style_class: 'list-search-result-content',
            vertical: false,
            // x_align: Clutter.ActorAlign.START,
            x_expand: true,
            y_expand: true,
        });
        this.set_child(content);

        let titleBox = new St.BoxLayout({
            style_class: 'list-search-result-title',
            y_align: Clutter.ActorAlign.CENTER,
        });

        content.add_child(titleBox);

        // An icon for, or thumbnail of, content
        let icon = this.metaInfo['createIcon'](this.ICON_SIZE);
        if (icon)
            titleBox.add_child(icon);

        let title = new St.Label({
            text: this.metaInfo['name'],
            y_align: Clutter.ActorAlign.CENTER,
        });
        titleBox.add_child(title);

        this.label_actor = title;

        if (this.metaInfo['description']) {
            this._descriptionLabel = new St.Label({
                style_class: 'list-search-result-description',
                y_align: Clutter.ActorAlign.CENTER,
            });
            content.add_child(this._descriptionLabel);
        }

        const controlsBox = new St.BoxLayout({
            style_class: 'wsp-control-box',
            x_expand: true,
            x_align: Clutter.ActorAlign.END,
        });

        const moveBtn = new St.Button({
            style_class: 'wsp-button',
            x_expand: false,
            x_align: Clutter.ActorAlign.CENTER,
            accessible_role: Atk.Role.PUSH_BUTTON,
        });

        const moveIcon = new St.Icon({
            icon_name: 'pan-down-symbolic',
            icon_size: 20,
        });

        moveBtn.connect('clicked', () => {
            provider.action = Me.Action.MOVE_TO_WS;
            this.activate(false);
        });

        moveBtn.set_child(moveIcon);
        controlsBox.add_child(moveBtn);

        const closeBtn = new St.Button({
            style_class: 'wsp-button-trash',
            toggle_mode: false,
            x_expand: false,
            x_align: Clutter.ActorAlign.CENTER,
            accessible_role: Atk.Role.PUSH_BUTTON,
        });

        const closeIcon = new St.Icon({
            icon_name: 'window-close-symbolic',
            icon_size: 20,
        });

        closeBtn.connect('clicked', () => {
            provider.action = Me.Action.CLOSE;
            this.activate(false);
        });

        closeBtn.set_child(closeIcon);
        controlsBox.add_child(closeBtn);

        content.add_child(controlsBox);

        // The first highlight
        this._highlightTerms(provider);
    }

    get ICON_SIZE() {
        return 24;
    }

    vfunc_clicked() {
        this.activate();
    }

    activate(hideOverview = true) {
        hideOverview = hideOverview && !Me.Util.isAltPressed();
        this.provider.activateResult(this.metaInfo.id);
        this.provider.action = 0;

        if (this.metaInfo.clipboardText) {
            St.Clipboard.get_default().set_text(
                St.ClipboardType.CLIPBOARD, this.metaInfo.clipboardText);
        }

        // Hold Alt to avoid leaving the overview
        // this works for actions that don't involve a window activation, which closes the overview
        if (hideOverview) {
            Main.overview.hide();
        } else {
            const text = Main.overview.searchEntry.text;
            Main.overview.searchEntry.text = `${text}?*?`;
            if (timeout)
                GLib.source_remove(timeout);
            timeout = GLib.timeout_add(GLib.PRIORITY_LOW, 200, () => {
                Main.overview.searchController._searchResults._reset();
                Main.overview.searchEntry.text = text;
                timeout = 0;
                return GLib.SOURCE_REMOVE;
            });
        }
    }

    _highlightTerms(provider) {
        let markup = provider._highlighter.highlight(this.metaInfo['name'], opt);
        this.label_actor.clutter_text.set_markup(markup);
        markup = provider._highlighter.highlight(this.metaInfo['description'].split('\n')[0], opt);
        this._descriptionLabel.clutter_text.set_markup(markup);
    }
});
