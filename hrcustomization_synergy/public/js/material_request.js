frappe.ui.form.on("Material Request", {
    refresh: function(frm) {
        frm.page.remove_inner_button("Material Transfer", "Create");

        if (
            frm.doc.docstatus === 1 &&
            frm.doc.material_request_type === "Material Transfer"
        ) {
            frm.add_custom_button(
                __("Make Balance Available for Purchase"),
                function() {
                    frappe.call({
                        method: "hrcustomization_synergy.api.material_transfer_purchase.make_material_transfer_balance_available",
                        args: {
                            material_request: frm.doc.name
                        },
                        freeze: true,
                        freeze_message: __(
                            "Checking remaining quantities..."
                        ),
                        callback: function(r) {
                            if (!r.message) {
                                return;
                            }
                            frappe.msgprint({
                                title: __("Available for Purchase"),
                                message: r.message.message,
                                indicator: "green"
                            });
                            frm.reload_doc();
                        }
                    });
                },
                __("Purchase")
            );
        }
    }
});