frappe.ui.form.on("Purchase Order", {
    refresh: function(frm) {

        if (frm.doc.docstatus !== 0) {
            return;
        }

        frm.add_custom_button(
            __("Transfer Balance"),
            function() {
                show_transfer_balance_dialog(frm);
            },
            __("Get Items From")
        );
    }
});


function show_transfer_balance_dialog(frm) {

    frappe.call({
        method: "hrcustomization_synergy.api.material_transfer_purchase.get_material_transfer_purchase_balance",

        freeze: true,

        freeze_message: __("Finding available transfer balances..."),

        callback: function(r) {

            if (!r.message || !r.message.length) {

                frappe.msgprint({
                    title: __("No Items Available"),
                    message: __("There are no Material Transfer quantities available for purchase."),
                    indicator: "orange"
                });

                return;
            }


            // ---------------------------------------------------------
            // Create Dialog with Link Fields Dropdown
            // ---------------------------------------------------------

            let dialog = new frappe.ui.Dialog({

                title: __("Get Transfer Balance"),

                size: "extra-large",

                fields: [
                    {
                        label: __("Filter Supplier"),
                        fieldname: "supplier_filter",
                        fieldtype: "Link",
                        options: "Supplier",
                        placeholder: __("Select Supplier..."),
                        onchange: function() {
                            filter_dialog_table(dialog);
                        }
                    },
                    {
                        fieldtype: "Column Break"
                    },
                    {
                        label: __("Filter Item"),
                        fieldname: "item_filter",
                        fieldtype: "Link",
                        options: "Item",
                        placeholder: __("Select Item..."),
                        onchange: function() {
                            filter_dialog_table(dialog);
                        }
                    },
                    {
                        fieldtype: "Section Break"
                    },
                    {
                        fieldname: "transfer_items",
                        fieldtype: "HTML"
                    }
                ],

                primary_action_label: __("Add"),

                primary_action: function() {

                    let selected_items = [];

                    dialog.fields_dict.transfer_items
                        .$wrapper
                        .find(".transfer-select-checkbox:checked")
                        .each(function() {

                            let index = parseInt(
                                this.getAttribute("data-index")
                            );

                            if (
                                !isNaN(index) &&
                                r.message[index]
                            ) {
                                selected_items.push(
                                    r.message[index]
                                );
                            }
                        });


                    // -------------------------------------------------
                    // Nothing selected
                    // -------------------------------------------------

                    if (!selected_items.length) {

                        frappe.msgprint({
                            title: __("No Items Selected"),
                            message: __("Please select at least one item."),
                            indicator: "orange"
                        });

                        return;
                    }


                    // -------------------------------------------------
                    // Add selected items
                    // -------------------------------------------------

                    let processed = 0;


                    selected_items.forEach(function(balance_item) {

                        if (!balance_item.material_request) {

                            frappe.msgprint({
                                title: __("Missing Material Request"),
                                message:
                                    __("The balance query did not return the Material Request name."),
                                indicator: "red"
                            });

                            return;
                        }


                        if (!balance_item.material_request_item) {

                            frappe.msgprint({
                                title: __("Missing Material Request Item"),
                                message:
                                    __("The balance query did not return the Material Request Item name."),
                                indicator: "red"
                            });

                            return;
                        }


                        // -------------------------------------------------
                        // Get latest balance
                        // -------------------------------------------------

                        frappe.call({

                            method:
                                "hrcustomization_synergy.api.material_transfer_purchase.get_material_transfer_purchase_items",

                            args: {

                                material_request:
                                    balance_item.material_request,

                                material_request_item:
                                    balance_item.material_request_item

                            },

                            freeze: true,

                            freeze_message:
                                __("Checking latest balance..."),

                            callback: function(response) {

                                if (
                                    !response.message ||
                                    !response.message.length
                                ) {

                                    frappe.msgprint(
                                        __(
                                            "No item was returned for Material Request {0}.",
                                            [
                                                balance_item.material_request
                                            ]
                                        )
                                    );

                                    processed++;

                                    if (
                                        processed ===
                                        selected_items.length
                                    ) {
                                        dialog.hide();
                                    }

                                    return;
                                }


                                // -------------------------------------------------
                                // Add item to Purchase Order
                                // -------------------------------------------------

                                response.message.forEach(
                                    function(item) {

                                        let child =
                                            frm.add_child("items");

                                        child.item_code =
                                            item.item_code;

                                        child.item_name =
                                            item.item_name;

                                        child.description =
                                            item.description;

                                        child.qty =
                                            item.qty;

                                        child.uom =
                                            item.uom;

                                        child.stock_uom =
                                            item.stock_uom;

                                        child.conversion_factor =
                                            item.conversion_factor || 1;

                                        child.warehouse =
                                            item.warehouse;

                                        child.material_request =
                                            item.material_request;

                                        child.material_request_item =
                                            item.material_request_item;

                                        if (item.cost_center) {
                                            child.cost_center =
                                                item.cost_center;
                                        }

                                        if (item.project) {
                                            child.project =
                                                item.project;
                                        }

                                    }
                                );


                                processed++;


                                if (
                                    processed ===
                                    selected_items.length
                                ) {

                                    frm.refresh_field("items");

                                    dialog.hide();

                                    frappe.show_alert({

                                        message:
                                            __(
                                                "{0} item(s) added",
                                                [
                                                    selected_items.length
                                                ]
                                            ),

                                        indicator:
                                            "green"

                                    });

                                    frm.trigger(
                                        "calculate_taxes_and_totals"
                                    );
                                }

                            }

                        });

                    });

                }

            });


            // ---------------------------------------------------------
            // Create Table (Full Width)
            // ---------------------------------------------------------

            let html = `
                <div style="overflow-x:auto; width: 100%;">

                    <table class="table table-bordered" id="transfer-balance-table" style="width: 100%;">

                        <thead>
                            <tr>

                                <th style="width:50px; text-align:center;">
                                    <input
                                        type="checkbox"
                                        id="select-all-transfer-items"
                                    >
                                </th>

                                <th>Material Request</th>
                                <th>Item</th>
                                <th>Item Name</th>
                                <th>Supplier</th>
                                <th>Last Purchase Price</th>
                                <th>Requested</th>
                                <th>Transferred</th>
                                <th>Ordered</th>
                                <th>Balance</th>

                            </tr>
                        </thead>

                        <tbody>
            `;


            r.message.forEach(function(item, index) {

                let supplier_code = item.supplier || "";
                let supplier_name = item.supplier_name || "";
                
                let supplier_display = "";
                if (supplier_code) {
                    supplier_display = supplier_name ? 
                        `${supplier_code} - ${supplier_name}` : 
                        supplier_code;
                } else if (supplier_name) {
                    supplier_display = supplier_name;
                }

                html += `
                    <tr 
                        class="transfer-row" 
                        data-item="${frappe.utils.escape_html(item.item_code || "")}" 
                        data-supplier="${frappe.utils.escape_html(supplier_code + " " + supplier_name)}"
                    >

                        <td style="text-align:center;">

                            <input
                                type="checkbox"
                                class="transfer-select-checkbox"
                                data-index="${index}"
                            >

                        </td>


                        <td>
                            ${frappe.utils.escape_html(
                                item.material_request || ""
                            )}
                        </td>


                        <td>
                            ${frappe.utils.escape_html(
                                item.item_code || ""
                            )}
                        </td>


                        <td>
                            ${frappe.utils.escape_html(
                                item.item_name || ""
                            )}
                        </td>


                        <td>
                            ${frappe.utils.escape_html(
                                supplier_display
                            )}
                        </td>


                        <td style="text-align:right;">
                            ${format_currency(item.last_purchase_rate || 0)}
                        </td>


                        <td>
                            ${item.requested_qty || 0}
                        </td>


                        <td>
                            ${item.transferred_qty || 0}
                        </td>


                        <td>
                            ${item.ordered_qty || 0}
                        </td>


                        <td>
                            <b>${item.balance_qty || 0}</b>
                        </td>

                    </tr>
                `;

            });


            html += `
                        </tbody>

                    </table>

                </div>
            `;


            dialog.fields_dict.transfer_items
                .$wrapper
                .html(html);


            dialog.show();


            // ---------------------------------------------------------
            // Compact Dropdown Inputs (Keep Dropdown & Table Full)
            // ---------------------------------------------------------

            let $supplier_col = dialog.fields_dict.supplier_filter.$wrapper.closest('.form-column');
            let $item_col = dialog.fields_dict.item_filter.$wrapper.closest('.form-column');

            $supplier_col.css({
                'max-width': '280px',
                'flex': '0 0 280px'
            });

            $item_col.css({
                'max-width': '280px',
                'flex': '0 0 280px'
            });


            // ---------------------------------------------------------
            // Select / Unselect visible rows
            // ---------------------------------------------------------

            dialog.fields_dict.transfer_items
                .$wrapper
                .find("#select-all-transfer-items")
                .on("change", function() {

                    let checked = this.checked;

                    dialog.fields_dict.transfer_items
                        .$wrapper
                        .find(".transfer-row:visible .transfer-select-checkbox")
                        .prop("checked", checked);

                });

        }

    });

}


// ---------------------------------------------------------
// Helper function to filter table rows dynamically
// ---------------------------------------------------------

function filter_dialog_table(dialog) {
    let supplier_val = (dialog.get_value("supplier_filter") || "").toLowerCase().trim();
    let item_val = (dialog.get_value("item_filter") || "").toLowerCase().trim();

    let $wrapper = dialog.fields_dict.transfer_items.$wrapper;

    $wrapper.find(".transfer-row").each(function() {
        let row_item = ($(this).attr("data-item") || "").toLowerCase();
        let row_supplier = ($(this).attr("data-supplier") || "").toLowerCase();

        let matches_supplier = !supplier_val || row_supplier.includes(supplier_val);
        let matches_item = !item_val || row_item.includes(item_val);

        if (matches_supplier && matches_item) {
            $(this).show();
        } else {
            $(this).hide();
            $(this).find(".transfer-select-checkbox").prop("checked", false);
        }
    });
}


// ===========================================================
// Purchase History Popup (Purchase Order Item)
// ===========================================================

let dialog_timeout = null;

frappe.ui.form.on('Purchase Order Item', {
    custom_history: function (frm, cdt, cdn) {

        // --- Prevent Double Popup (Debounce) ---
        if (dialog_timeout) {
            clearTimeout(dialog_timeout);
        }

        if (window.dialog_open) return;

        window.dialog_open = true;

        let row = locals[cdt][cdn];

        if (!row.item_code) {
            frappe.msgprint(__('Please select an Item first.'));
            return;
        }

        // Safety check: Agar dialog already screen par hai to naya mat banao
        if ($('.modal-title:contains("Previous Purchase History")').is(':visible')) {
            return;
        }

        render_history_dialog(frm, row);

        dialog_timeout = setTimeout(() => {
            window.dialog_open = false;
        }, 3000);
    }
});

function render_history_dialog(frm, row) {
    let d = new frappe.ui.Dialog({
        title: __('Previous Purchase History'),
        size: 'large',
        fields: [
            {
                fieldtype: 'Date',
                label: 'From Date',
                fieldname: 'from_date',
                default: '2025-01-01',
                onchange: () => load_history()
            },
            {
                fieldtype: 'Date',
                label: 'To Date',
                fieldname: 'to_date',
                default: frappe.datetime.get_today(),
                onchange: () => load_history()
            },
            {
                fieldtype: 'HTML',
                fieldname: 'result_area'
            }
        ]
    });

    function load_history() {
        let values = d.get_values();
        if (!values || !values.from_date || !values.to_date) return;

        d.fields_dict.result_area.$wrapper.html(`<p class="text-muted p-2"><i class="fa fa-spinner fa-spin"></i> Fetching records...</p>`);

        frappe.call({
            method: 'hrcustomization_synergy.api.purchase_order.get_previous_purchases',
            args: {
                item_code: row.item_code,
                from_date: values.from_date,
                to_date: values.to_date
            },
            callback: function (r) {
                console.log("Response", r);

                let records = r.message || [];
                let count = records.length;


                let html = `
                    <div style="background: #f8f9fa; padding: 10px; border-radius: 4px; margin-bottom: 15px; border: 1px solid #d1d8dd;">
                        <div class="row">
                            <div class="col-sm-8">
                                <b>Item Code:</b>(${row.item_code})<br>
                                <b>Item Name:</b> ${row.item_name || ''}<br>
                                <small class="text-muted"> <strong> Used: ${count} time${count > 1 ? 's' : ''}</strong></small>
                            </div>
                        </div>
                    </div>
                `;

                if (count === 0) {
                    html += `<div class="alert alert-info">No purchase history found for this period.</div>`;
                    d.fields_dict.result_area.$wrapper.html(html);
                    return;
                }

                html += `
                    <table class="table table-bordered table-sm table-hover">
                        <thead class="bg-light">
                            <tr>
                                <th>PO Number</th>
                                <th>Supplier</th>
                                <th class="text-right">Qty</th>
                                <th>UOM</th>
                                <th class="text-right">Rate</th>
                                <th>Date</th>
                            </tr>
                        </thead>
                        <tbody>
                `;

                records.forEach(item => {
                    html += `
                        <tr>
                            <td><a href="/app/purchase-order/${item.doc_name}" target="_blank" style="font-weight:bold;">${item.doc_name}</a></td>
                            <td>${item.supplier_name}</td>
                            <td class="text-right">${item.qty}</td>
                            <td>${item.uom}</td>
                            <td class="text-right">${frappe.format(item.rate, { fieldtype: 'Currency' })}</td>
                            <td>
                            ${item.schedule_date ? moment(item.schedule_date).format("DD-MM-YYYY") : ""}
                            </td>
                        </tr>
                    `;
                });

                html += `</tbody></table>`;
                d.fields_dict.result_area.$wrapper.html(html);
            }
        });
    }

    d.show();
    load_history();
}