frappe.ui.form.on("Stock Entry", {

    // =========================
    // VALIDATION SECTION
    // =========================
    validate: async function (frm) {

        // -------------------------
        // 1. Same Company Check
        // -------------------------
        if (
            frm.doc.custom_source_company &&
            frm.doc.custom_target_company &&
            frm.doc.custom_source_company === frm.doc.custom_target_company
        ) {
            frappe.throw(__("Source Company and Target Company cannot be same"));
        }

        // -------------------------
        // 2. Source Warehouse Check
        // -------------------------
        if (frm.doc.custom_source_warehouse) {

            let source = await frappe.db.get_value(
                "Warehouse",
                frm.doc.custom_source_warehouse,
                "company"
            );

            if (source.message.company !== frm.doc.custom_source_company) {
                frappe.throw(__("Source Warehouse does not belong to Source Company"));
            }
        }

        // -------------------------
        // 3. Target Warehouse Check
        // -------------------------
        if (frm.doc.custom_target_warehouse) {

            let target = await frappe.db.get_value(
                "Warehouse",
                frm.doc.custom_target_warehouse,
                "company"
            );

            if (target.message.company !== frm.doc.custom_target_company) {
                frappe.throw(__("Target Warehouse does not belong to Target Company"));
            }
        }

        // -------------------------
        // 4. Stock Availability Check
        // -------------------------
        let item = (frm.doc.items || [])[0];
        if (!item) return;

        let r = await frappe.call({
            method: "frappe.client.get_value",
            args: {
                doctype: "Bin",
                filters: {
                    item_code: item.item_code,
                    warehouse: frm.doc.custom_source_warehouse
                },
                fieldname: "actual_qty"
            }
        });

        let available = r.message ? (r.message.actual_qty || 0) : 0;
        let required = item.qty || 0;

        if (available < required) {
            frappe.throw(
                `Insufficient Stock for ${item.item_code}: Available ${available}, Required ${required}`
            );
        }
    },

    // =========================
    // MAIN ACTION BUTTON
    // =========================
    refresh: function (frm) {

        if (
            frm.doc.custom_source_company &&
            frm.doc.custom_target_company
        ) {

            frm.add_custom_button("Process Intercompany Transfer", async function () {

                frappe.msgprint("Processing Intercompany Transfer...");

                // =========================
                // 1. MATERIAL ISSUE
                // =========================
                let issue = await frappe.call({
                    method: "frappe.client.insert",
                    args: {
                        doc: {
                            doctype: "Stock Entry",
                            stock_entry_type: "Material Issue",
                            purpose: "Material Issue",
                            company: frm.doc.custom_source_company,
                            items: frm.doc.items.map(i => ({
                                item_code: i.item_code,
                                qty: i.qty,
                                s_warehouse: frm.doc.custom_source_warehouse
                            }))
                        }
                    }
                });

                console.log("Issue Created:", issue.message);

                // =========================
                // 2. MATERIAL RECEIPT
                // =========================
                let receipt = await frappe.call({
                    method: "frappe.client.insert",
                    args: {
                        doc: {
                            doctype: "Stock Entry",
                            stock_entry_type: "Material Receipt",
                            purpose: "Material Receipt",
                            company: frm.doc.custom_target_company,
                            items: frm.doc.items.map(i => ({
                                item_code: i.item_code,
                                qty: i.qty,
                                t_warehouse: frm.doc.custom_target_warehouse,

                                // IMPORTANT:
                                // valuation_rate yahan force inject karna hai (future enhancement)
                                // valuation_rate: issue_rate
                            }))
                        }
                    }
                });

                console.log("Receipt Created:", receipt.message);

                frappe.msgprint("Intercompany Transfer Completed Successfully");

                frm.reload_doc();
            });
        }
    }
});