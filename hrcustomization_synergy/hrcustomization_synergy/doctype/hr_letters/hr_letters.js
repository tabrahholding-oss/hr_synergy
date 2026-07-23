// Copyright (c) 2026, NexTash and contributors
// For license information, please see license.txt

frappe.ui.form.on('HR Letters', {
    employee(frm) {
        auto_fetch_salary_components(frm);
    },

    refresh(frm) {
        if (frm.is_new() || !frm.doc.certificate_type) return;

        // ---- PRINT PREVIEW: hamesha available, signature nahi ----
        frm.add_custom_button(__('Print Preview'), () => {
            open_print(frm, true);
        });

        // ---- PRINT CERTIFICATE: sirf Approved hone k baad, signature k sath ----
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
    refresh(frm) {
        toggle_valid_till(frm);
    },
    
    certificate_type(frm) {
        // reset dependent fields jab type change ho
        frm.set_value('resignation_letter_date', '');
        frm.set_value('custom_country', '');
        frm.set_value('purpose', '');
        frm.clear_table('warning_details');
        frm.clear_table('salary_component');
        frm.refresh_field('warning_details');
        frm.refresh_field('salary_component');
        
        auto_fetch_salary_components(frm);
        toggle_valid_till(frm);
    }
});
function toggle_valid_till(frm) {
    const reqd = frm.doc.certificate_type !== "Employee Travel NOC";

    frm.set_df_property("valid_till", "hidden", !reqd);
    frm.set_df_property("valid_till", "reqd", reqd);

    if (!reqd) {
        frm.set_value("valid_till", null);
    }

    frm.refresh_field("valid_till");
}
function open_print(frm, is_preview) {
    const format_map = {
        "Termination Letter": "Termination Letter",
        "Non Confirmation Letter": "Non Confirmation Letter",
        "Employment Certificate": "Employment Certificate",
        "Warning Letter": "Warning Letter",
        "Salary Increment": "Salary Increment Letter",
        "Asset Declaration": "Asset Declaration",
        "Employee Clearance Acknowledgement": "Employee Clearance Acknowledgement",
        "Employee Confirmation": "Employee Confirmation",
        "Employee Travel NOC": "Employee Travel NOC",

    };

    const print_format = format_map[frm.doc.certificate_type];
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

function auto_fetch_salary_components(frm) {
    if (
        !frm.doc.employee ||
        !["Salary Increment", "Employee Confirmation"].includes(frm.doc.certificate_type)
    ) {
        return;
    }
    frappe.call({
        method: 'frappe.client.get_list',
        args: {
            doctype: 'Salary Structure Assignment',
            filters: { employee: frm.doc.employee },
            fields: ['name'],
            order_by: 'from_date desc',
            limit_page_length: 1
        },
        callback(r) {
            if (!(r.message && r.message.length)) {
                frappe.msgprint(__('No Salary Structure Assignment found for this employee.'));
                return;
            }
            frappe.call({
                method: 'frappe.client.get',
                args: { doctype: 'Salary Structure Assignment', name: r.message[0].name },
                callback(res) {
                    const a = res.message;
                    frm.clear_table('salary_component');

                    const components = [
                        { label: 'Basic', value: a.base },
                        { label: 'House Allowance', value: a.custom_hra },
                        {
                            label: 'Other Allowance', value: a.custom_total_salary && a.base
                                ? (flt(a.custom_total_salary) - (flt(a.base) + flt(a.custom_hra || 0))) : 0
                        }
                    ];

                    components.forEach(c => {
                        if (c.value) {
                            let row = frm.add_child('salary_component');
                            row.component = c.label;
                            row.current_salary = c.value;
                            row.revised_salary = c.value;
                        }
                    });
                    frm.refresh_field('salary_component');
                }
            });
        }
    });
}