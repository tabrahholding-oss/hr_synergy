// Copyright (c) 2026, NexTash and contributors
// For license information, please see license.txt

frappe.ui.form.on('Certificate Request Detail', {
    refresh(frm) {
        if (frm.doc.certificate_type && !frm.is_new()) {
            frm.add_custom_button(__('Print Certificate'), () => {
                const format_map = {
                    "Salary Certificate QDC": "Salary Certificate QDC",
                    "Salary Certificate CBQ Card": "Salary Certificate CBQ Card",
                    "Salary Certificate CBQ": "Salary Certificate CBQ",
                    "Salary Certificate": "Salary Certificate",
                    "Experience Letter": "Experience Letter",
                    "Termination Letter": "Termination Letter",
                    "Non Confirmation Letter": "Non Confirmation Letter",
                    "Employment Certificate": "Employment Certificate",
                    "Warning Letter": "Warning Letter"
                };

                const print_format = format_map[frm.doc.certificate_type];
                if (!print_format) {
                    frappe.msgprint(__('No print format mapped for this Certificate Type'));
                    return;
                }

                const url = frappe.urllib.get_full_url(
                    "/printview?doctype=" + encodeURIComponent(frm.doctype) +
                    "&name=" + encodeURIComponent(frm.doc.name) +
                    "&format=" + encodeURIComponent(print_format) +
                    "&no_letterhead=0"
                );
                window.open(url, "_blank");
            }).addClass('btn-primary');
        }
    },

    certificate_type(frm) {
        // reset dependent fields jab type change ho
        frm.set_value('resignation_letter_date', '');
        frm.set_value('custom_country', '');
    }
});