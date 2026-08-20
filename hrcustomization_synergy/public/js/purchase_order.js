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
            // Create dialog
            // ---------------------------------------------------------

            let dialog = new frappe.ui.Dialog({

                title: __("Get Transfer Balance"),

                size: "extra-large",

                fields: [
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

                        console.log(
                            "SELECTED TRANSFER BALANCE ITEM:",
                            balance_item
                        );


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

                                console.log(
                                    "PURCHASE ITEM RESPONSE:",
                                    response
                                );


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

                                        // IMPORTANT
                                        // Keep conversion factor
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
            // Create table
            // ---------------------------------------------------------

            let html = `
                <div style="overflow-x:auto;">

                    <table class="table table-bordered">

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
                                <th>Requested</th>
                                <th>Transferred</th>
                                <th>Ordered</th>
                                <th>Balance</th>

                            </tr>
                        </thead>

                        <tbody>
            `;


            r.message.forEach(function(item, index) {

                html += `
                    <tr>

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
            // Select / Unselect all
            // ---------------------------------------------------------

            dialog.fields_dict.transfer_items
                .$wrapper
                .find("#select-all-transfer-items")
                .on("change", function() {

                    let checked = this.checked;

                    dialog.fields_dict.transfer_items
                        .$wrapper
                        .find(".transfer-select-checkbox")
                        .prop("checked", checked);

                });

        }

    });

}