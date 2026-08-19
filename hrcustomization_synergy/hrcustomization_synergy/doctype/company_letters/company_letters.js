// Copyright (c) 2026, NexTash and contributors
// For license information, please see license.txt

frappe.ui.form.on('Company Letters', {
    refresh(frm) {
        // Dynamic options update karein
        frm.trigger('update_user_options');

        // Custom Print Buttons Logic
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
    },

    letter_type: function(frm) {
        frm.trigger('update_user_options');
    },

    update_user_options: function(frm) {
        // Tamam 5 options
        let all_options = [
            "",
            "Ali Mohamed Al Kuwari",
            "Abdulla Mohammad Al Kuwari",
            "Ossama Mohamed Nabil Abdelgawwad",
            "Joana Marie Tanglao",
            "Hamad Shoby Ali Khalil"
        ];

        // Hamad ke ilawa baki 4 options
        let restricted_options = [
            "",
            "Ali Mohamed Al Kuwari",
            "Abdulla Mohammad Al Kuwari",
            "Ossama Mohamed Nabil Abdelgawwad",
            "Joana Marie Tanglao"
        ];

        if (frm.doc.letter_type === 'Project Letters') {
            // "Project Letters" ke waqt 5 options show hongy
            frm.set_df_property('user', 'options', all_options);
        } else {
            // Baki case me sirf 4 options nazar aayenge
            frm.set_df_property('user', 'options', restricted_options);
            
            // Agar pehle se Hamad selected ho to value clear kar dein
            if (frm.doc.user === 'Hamad Shoby Ali Khalil') {
                frm.set_value('user', '');
            }
        }
    }
});

function open_print(frm, is_preview) {
    const format_map = {
        "Memo": "Memo",
        "Offers": "Offers",
        "Circulars": "Circulars",
        "Project Letters": "Project Letters",
        "MOI Letter": "MOI Letter",
        "MOL Letter": "MOL Letter",
        "Kahramaa Letter": "Kahramaa Letter",
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
