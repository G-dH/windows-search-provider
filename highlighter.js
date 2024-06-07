/**
 * WSP (Windows Search Provider)
 * highlighter.js
 *
 * add options to the default GNOME SHELL's Highlighter
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2024
 * @license    GPL-3.0
 */

import GLib from 'gi://GLib';
import { Highlighter } from 'resource:///org/gnome/shell/misc/util.js';
import * as Search from 'resource:///org/gnome/shell/ui/search.js';

let Me;
let opt;

export function enable(me) {
    Me = me;
    opt = Me.opt;
    Me._overrides.addOverride('Highlighter', Highlighter.prototype, HighlighterOverride);
    Me._overrides.addOverride('ListSearchResult', Search.ListSearchResult.prototype, ListSearchResultOverride);
}

export function disable() {
    Me._overrides.removeOverride('Highlighter');
    Me._overrides.removeOverride('ListSearchResult');
    opt = null;
    Me = null;
}

const  HighlighterOverride = {
    /**
     * @param {?string[]} terms - list of terms to highlight
     */
    /* constructor(terms) {
        if (!terms)
            return;

        const escapedTerms = terms
            .map(term => Shell.util_regex_escape(term))
            .filter(term => term.length > 0);

        if (escapedTerms.length === 0)
            return;

        this._highlightRegex = new RegExp(
            `(${escapedTerms.join('|')})`, 'gi');
    },*/

    /**
     * Highlight all occurrences of the terms defined for this
     * highlighter in the provided text using markup.
     *
     * @param {string} text - text to highlight the defined terms in
     * @returns {string}
     */
    highlight(text, options) {
        if (!this._highlightRegex)
            return GLib.markup_escape_text(text, -1);

        // force use local settings if the class is overridden by another extension (V-Shell, ESP)
        const o = options || opt;
        let escaped = [];
        let lastMatchEnd = 0;
        let match;
        let style = ['', ''];
        if (o.HIGHLIGHT_DEFAULT)
            style = ['<b>', '</b>'];
        // The default highlighting by the bold style causes text to be "randomly" ellipsized in cases where it's not necessary
        // and also blurry
        // Underscore doesn't affect label size and all looks better
        else if (o.HIGHLIGHT_UNDERLINE)
            style = ['<u>', '</u>'];

        while ((match = this._highlightRegex.exec(text))) {
            if (match.index > lastMatchEnd) {
                let unmatched = GLib.markup_escape_text(
                    text.slice(lastMatchEnd, match.index), -1);
                escaped.push(unmatched);
            }
            let matched = GLib.markup_escape_text(match[0], -1);
            escaped.push(`${style[0]}${matched}${style[1]}`);
            lastMatchEnd = match.index + match[0].length;
        }
        let unmatched = GLib.markup_escape_text(
            text.slice(lastMatchEnd), -1);
        escaped.push(unmatched);
        return escaped.join('');
    },
};

// Add highlighting of the "name" part of the result for all providers
const ListSearchResultOverride = {
    _highlightTerms() {
        let markup = this._resultsView.highlightTerms(this.metaInfo['name']);
        this.label_actor.clutter_text.set_markup(markup);
        markup = this._resultsView.highlightTerms(this.metaInfo['description'].split('\n')[0]);
        this._descriptionLabel.clutter_text.set_markup(markup);
    },
};
