/**
 * WSP (Windows Search Provider)
 * dashIcon.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2024
 * @license    GPL-3.0
 */


import Clutter from 'gi://Clutter';
import St from 'gi://St';
import GObject from 'gi://GObject';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Dash from 'resource:///org/gnome/shell/ui/dash.js';
import * as DND from 'resource:///org/gnome/shell/ui/dnd.js';
import * as IconGrid from 'resource:///org/gnome/shell/ui/iconGrid.js';

let Me;
let opt;
let _;

export class DashOpenWindowsIcon {
    constructor(me) {
        Me = me;
        opt = Me.opt;
        _ = Me._;

        this.updateIcon();
    }

    updateIcon(show) {
        opt._updateCachedSettings();
        show = show ?? !!opt.DASH_ICON_POSITION;

        const dash = Main.overview._overview._controls.layoutManager._dash;
        const dashContainer = dash._dashContainer;
        const dashBox = dash._box;

        if (!show && dash._showWindowsIcon) {
            dashContainer.remove_child(dash._showWindowsIcon);
            if (dash._showWindowsIconClickedId) {
                dash._showWindowsIcon.toggleButton.disconnect(dash._showWindowsIconClickedId);
                dash._showWindowsIconClickedId = 0;
            }
            if (this._allocateSigId) {
                dashBox.disconnect(this._allocateSigId);
                this._allocateSigId = 0;
            }
            delete dash._showWindowsIconClickedId;
            if (dash._showWindowsIcon)
                dash._showWindowsIcon.destroy();
            delete dash._showWindowsIcon;
        }

        if (!show)
            return;

        if (!dash._showWindowsIcon) {
            dash._showWindowsIcon = new OpenWindowsIcon();
            dash._showWindowsIcon.show(false);
            dashContainer.add_child(dash._showWindowsIcon);
            dash._hookUpLabel(dash._showWindowsIcon);
        }

        this._setIconPosition(dash);

        Main.overview._overview._controls.layoutManager._dash._adjustIconSize();

        if (dash._showWindowsIcon && !dash._showWindowsIconClickedId) {
            dash._showWindowsIconClickedId = dash._showWindowsIcon.toggleButton.connect('clicked', () => {
                this._activateSearchProvider(Me.PREFIX);
            });
        }

        if (!this._allocateSigId) {
            this._allocateSigId = dashBox.connect('notify::allocation', () => {
                const icon = dash._showWindowsIcon;
                if (icon._size === dash.iconSize)
                    return;

                const scale = icon._size / dash.iconSize;
                icon.icon.setIconSize(dash.iconSize);

                const [targetWidth, targetHeight] = icon.icon.get_size();

                // Scale the icon's texture to the previous size and
                // tween to the new size
                icon.icon.set_size(icon.icon.width * scale,
                    icon.icon.height * scale);

                icon.icon.ease({
                    width: targetWidth,
                    height: targetHeight,
                    duration: Dash.DASH_ANIMATION_TIME,
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                });
                this._setIconPosition(dash);
            });

            dash.emit('icon-size-changed');
        }
    }

    _setIconPosition(dash) {
        dash._showWindowsIcon.icon.setIconSize(dash.iconSize);
        const containerArray = dash._dashContainer.get_children();
        const showAppsIconIndex = containerArray.indexOf(dash._showAppsIcon);

        if (opt.DASH_ICON_POSITION === 1) {
            dash._dashContainer.set_child_at_index(dash._showWindowsIcon, 0);
            if (showAppsIconIndex > -1 && showAppsIconIndex === 0)
                dash._dashContainer.set_child_at_index(dash._showAppsIcon, 0);
        } else if (opt.DASH_ICON_POSITION === 2) {
            const lastIndex = containerArray.length - 1;

            dash._dashContainer.set_child_at_index(dash._showWindowsIcon, lastIndex);
            if (showAppsIconIndex > -1 && showAppsIconIndex !== 0)
                dash._dashContainer.set_child_at_index(dash._showAppsIcon, lastIndex);
        }
    }

    _activateSearchProvider(prefix = '') {
        const searchEntry = Main.overview.searchEntry;
        const searchEntryText = searchEntry.get_text();
        if (!searchEntryText || (searchEntryText && !searchEntry.get_text().startsWith(prefix))) {
            prefix = `${prefix} `;
            const position = prefix.length;
            searchEntry.set_text(prefix);
            searchEntry.get_first_child().set_cursor_position(position);
            searchEntry.get_first_child().set_selection(position, position);
        } else {
            searchEntry.set_text('');
        }
    }

    destroy() {
        this.updateIcon(false);
        Me = null;
        opt = null;
        _ = null;
    }
}

const OpenWindowsIcon = GObject.registerClass({
    // Registered name should be unique
    GTypeName: `OpenWindowsIcon${Math.floor(Math.random() * 1000)}`,
}, class OpenWindowsIcon extends Dash.DashItemContainer {
    _init() {
        super._init();

        this._labelText = _('Search Open Windows');
        this.toggleButton = new St.Button({
            style_class: 'show-apps',
            track_hover: true,
            can_focus: true,
            toggle_mode: false,
        });

        this._iconActor = null;
        this.icon = new IconGrid.BaseIcon(this.labelText, {
            setSizeManually: true,
            showLabel: false,
            createIcon: this._createIcon.bind(this),
        });
        this.icon.y_align = Clutter.ActorAlign.CENTER;

        this.toggleButton.add_child(this.icon);
        this.toggleButton._delegate = this;

        this.setChild(this.toggleButton);
    }

    _createIcon(size) {
        this._iconActor = new St.Icon({
            icon_name: 'focus-windows-symbolic',
            icon_size: size,
            style_class: 'show-apps-icon',
            track_hover: true,
        });
        this._size = size;
        return this._iconActor;
    }

    setDragApp() {
    }

    handleDragOver() {
        return DND.DragMotionResult.NO_DROP;
    }

    acceptDrop() {
        return false;
    }
});
