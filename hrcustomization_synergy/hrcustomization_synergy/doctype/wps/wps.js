
// For license information, please see license.txt

frappe.ui.form.on("WPS", {
	refresh(frm) {
        if (frm.doc.docstatus == 1) {
            frm.add_custom_button(__("Download"), () => {
                window.location.href = repl(
                    frappe.request.url + "?cmd=%(cmd)s&docname=%(docname)s",
                    {
                        cmd: "hrcustomization_synergy.hrcustomization_synergy.doctype.wps.wps.get_wps_csv",
                        docname: frm.doc.name
                    },
                );
            })
        }

    },
    get_employees(frm) {
        frm.call({
            method: "get_filtered_employees",
            doc: frm.doc,
            callback: function() {
                frm.refresh_field("employees");
            }
        });
    }
});
