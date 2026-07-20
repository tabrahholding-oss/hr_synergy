// Copyright (c) 2026, NexTash and contributors
// For license information, please see license.txt

frappe.ui.form.on('Company Letters', {
    refresh(frm) {
        if (frm.is_new() || !frm.doc.letter_type) return;

        frm.add_custom_button(__('Print Preview'), () => {
            open_print(frm, true);
        });

        if (frm.doc.status === 'Approved') {
            frm.add_custom_button(__('Print Certificate'), () => {
                open_print(frm, false);
            }).addClass('btn-primary');
        } else {
            frm.dashboard.add_comment(
                __('Final "Print Certificate" will be available only after approval. Use "Print Preview" for now.'),
                'blue', true
            );
        }
    }
});

function open_print(frm, is_preview) {
    const format_map = {
        "Internal Memos": "Internal Memos",
        "Offers": "Offers",
        "Circulars": "Circulars"
    };

    const print_format = format_map[frm.doc.letter_type];
    if (!print_format) {
        frappe.msgprint(__('No print format mapped for this Certificate Type'));
        return;
    }

    let url = frappe.urllib.get_full_url(
        "/printview?doctype=" + encodeURIComponent(frm.doctype) +
        "&name=" + encodeURIComponent(frm.doc.name) +
        "&format=" + encodeURIComponent(print_format) +
        "&no_letterhead=0"
    );

    if (is_preview) {
        url += "&preview=1";
    }
    window.open(url, "_blank");
}


