// Copyright (c) 2026, NexTash and contributors
// For license information, please see license.txt

frappe.ui.form.on('Employee Letters', {
    refresh(frm) {
        if (frm.is_new() || !frm.doc.certificate_type) return;

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
    },

    certificate_type(frm) {
        frm.set_value('custom_country', '');
        frm.set_value('relieving_date', '');
        frm.set_value('bank', '');
    },

    bank(frm) {
        // sirf refresh k liye, buttons already dynamically resolve karte hain
        frm.refresh();
    }
});

const BANK_FORMAT_MAP = {
    "QDC": "Salary Certificate QDC",
    "CBQ": "Salary Certificate CBQ",
    "CBQ Card": "Salary Certificate CBQ Card"
};

function get_print_format(frm) {
    if (frm.doc.certificate_type === "Salary Certificate") {
        if (frm.doc.bank && BANK_FORMAT_MAP[frm.doc.bank]) {
            return BANK_FORMAT_MAP[frm.doc.bank];
        }
        return "Salary Certificate";
    }
    const format_map = {
        "Employment Certificate": "Employment Certificate",
        "Experience Letter": "Experience Letter"
    };
    return format_map[frm.doc.certificate_type];
}

function open_print(frm, is_preview) {
    const print_format = get_print_format(frm);
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