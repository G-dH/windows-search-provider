/**
 * WSP (Windows Search Provider)
 * util.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022 - 2024
 * @license    GPL-3.0
 *
 */

'use strict';

const  { GLib, Clutter, Meta, Shell } = imports.gi;

const Main = imports.ui.main;

let Me;

function init(me) {
    Me = me;
}

function cleanGlobals() {
    Me = null;
}

function openPreferences(metadata) {
    if (!metadata)
        metadata = Me.metadata;
    const windows = global.display.get_tab_list(Meta.TabList.NORMAL_ALL, null);
    let tracker = Shell.WindowTracker.get_default();
    let metaWin, isMe = null;

    for (let win of windows) {
        const app = tracker.get_window_app(win);
        if (win.get_title()?.includes(metadata.name) && app.get_name() === 'Extensions') {
            // this is our existing window
            metaWin = win;
            isMe = true;
            break;
        } else if (win.wm_class?.includes('org.gnome.Shell.Extensions')) {
            // this is prefs window of another extension
            metaWin = win;
            isMe = false;
        }
    }

    if (metaWin && !isMe) {
        // other prefs window blocks opening another prefs window, so close it
        metaWin.delete(global.get_current_time());
    } else if (metaWin && isMe) {
        // if prefs window already exist, move it to the current WS and activate it
        metaWin.change_workspace(global.workspace_manager.get_active_workspace());
        metaWin.activate(global.get_current_time());
    }

    if (!metaWin || (metaWin && !isMe)) {
        // delay to avoid errors if previous prefs window has been colsed
        GLib.idle_add(GLib.PRIORITY_LOW, () => {
            try {
                Main.extensionManager.openExtensionPrefs(metadata.uuid, '', {});
            } catch (e) {
                console.error(e);
            }
        });
    }
}

function isShiftPressed(state = null) {
    if (state === null)
        [,, state] = global.get_pointer();
    return (state & Clutter.ModifierType.SHIFT_MASK) !== 0;
}

function isCtrlPressed(state = null) {
    if (state === null)
        [,, state] = global.get_pointer();
    return (state & Clutter.ModifierType.CONTROL_MASK) !== 0;
}

function isAltPressed(state = null) {
    if (state === null)
        [,, state] = global.get_pointer();
    return (state & Clutter.ModifierType.MOD1_MASK) !== 0;
}

function fuzzyMatch(term, text) {
    let pos = -1;
    const matches = [];
    // convert all accented chars to their basic form and to lower case
    const _text = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const _term =  term.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

    // if term matches the substring exactly, gains the highest weight
    if (_text.includes(_term))
        return 0;

    for (let i = 0; i < _term.length; i++) {
        let c = _term[i];
        let p;
        if (pos > 0)
            p = _term[i - 1];
        while (true) {
            pos += 1;
            if (pos >= _text.length)
                return -1;

            if (_text[pos] === c) {
                matches.push(pos);
                break;
            } else if (_text[pos] === p) {
                matches.pop();
                matches.push(pos);
            }
        }
    }

    // add all position to get a weight of the result
    // results closer to the beginning of the text and term characters closer to each other will gain more weight.
    return matches.reduce((r, p) => r + p) - matches.length * matches[0] + matches[0];
}

function strictMatch(term, text) {
    // remove diacritics and accents from letters
    let s = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    let p = term.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    let ps = p.split(/ +/);

    // allows to use multiple exact patterns separated by a space in arbitrary order
    for (let w of ps) {  // escape regex control chars
        if (!s.match(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
            return -1;
    }
    return 0;
}

function isMoreRelevant(stringA, stringB, pattern) {
    let regex = /[^a-zA-Z\d]/;
    let strSplitA = stringA.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(regex);
    let strSplitB = stringB.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(regex);
    let aAny = false;
    strSplitA.forEach(w => {
        aAny = aAny || w.startsWith(pattern);
    });
    let bAny = false;
    strSplitB.forEach(w => {
        bAny = bAny || w.startsWith(pattern);
    });

    // if both strings contain a word that starts with the pattern
    // prefer the one whose first word starts with the pattern
    if (aAny && bAny)
        return !strSplitA[0].startsWith(pattern) && strSplitB[0].startsWith(pattern);
    else
        return !aAny && bAny;
}
