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


frappe.ui.form.on("Leave Application", {
    leave_type(frm) {
        calculate_forecasted_leave(frm);
    },

    from_date(frm) {
        calculate_forecasted_leave(frm);
    },

    employee(frm) {
        calculate_forecasted_leave(frm);
    }
});

function to_flt(value) {
    return parseFloat(value || 0) || 0;
}

// Function to calculate leave balance including Leave Adjustment and Carry Forward
async function get_leave_balance(employee, leave_type, target_date) {
    if (!employee || !leave_type || !target_date) return 0;

    // Get Leave Allocation valid for the selected from_date
    let allocations = await frappe.db.get_list("Leave Allocation", {
        filters: [
            ["employee", "=", employee],
            ["leave_type", "=", leave_type],
            ["docstatus", "=", 1],
            ["from_date", "<=", target_date],
            ["to_date", ">=", target_date]
        ],
        fields: [
            "name",
            "from_date",
            "to_date",
            "total_leaves_allocated",
            "carry_forwarded_leaves_count"
        ],
        order_by: "from_date desc",
        limit_page_length: 1
    });

    if (!allocations || allocations.length === 0) {
        return 0;
    }

    let allocation = allocations[0];

    // Get all Leave Ledger Entries inside this allocation period up to target date
    let ledger_entries = await frappe.db.get_list("Leave Ledger Entry", {
        filters: [
            ["employee", "=", employee],
            ["leave_type", "=", leave_type],
            ["docstatus", "=", 1],
            ["is_expired", "=", 0],
            ["is_lwp", "=", 0],
            ["from_date", "<=", target_date],
            ["to_date", ">=", allocation.from_date],
            ["transaction_type", "in", [
                "Leave Allocation",
                "Leave Application",
                "Leave Adjustment"
            ]]
        ],
        fields: [
            "leaves",
            "transaction_type",
            "transaction_name",
            "from_date",
            "to_date",
            "is_carry_forward"
        ],
        order_by: "from_date asc",
        limit_page_length: 500
    });

    let leave_balance = 0;

    if (ledger_entries && ledger_entries.length) {
        ledger_entries.forEach(row => {
            let leaves = to_flt(row.leaves);

            // FIX: Allow both regular allocations AND carry-forward leaves to build the base balance
            if (row.transaction_type === "Leave Allocation") {
                leave_balance += leaves;
            }

            // Leave Adjustment can be positive or negative
            if (row.transaction_type === "Leave Adjustment") {
                leave_balance += leaves;
            }

            // Leave Applications deduct from the balance
            if (row.transaction_type === "Leave Application") {
                leave_balance += leaves;
            }
        });
    }
    return leave_balance;
}

// Calculate forecasted leave
async function calculate_forecasted_leave(frm) {
    if (frm.doc.leave_type !== "Annual Leave" || !frm.doc.from_date || !frm.doc.employee) {
        frm.set_value("custom_forcasted_leave", 0);
        return;
    }

    let leave_balance = await get_leave_balance(
        frm.doc.employee,
        frm.doc.leave_type,
        frm.doc.from_date
    );

    // Get employee joining date
    let emp = await frappe.db.get_value("Employee", frm.doc.employee, [
        "date_of_joining",
        "relieving_date"
    ]);

    // Handle variation in how frappe returns db values based on framework versions
    let data = emp.message ? emp.message : emp;
    let joining_date = data.date_of_joining || frm.doc.date_of_joining || frm.doc.joining_date;

    if (!joining_date) {
        frappe.msgprint("Joining Date is missing for the employee.");
        frm.set_value("custom_forcasted_leave", leave_balance.toFixed(2));
        return;
    }

    // Years of service
    let today_date = new Date(frappe.datetime.get_today());
    let joining = new Date(joining_date);

    let years_of_service = today_date.getFullYear() - joining.getFullYear();
    let month_diff = today_date.getMonth() - joining.getMonth();

    if (
        month_diff < 0 ||
        (month_diff === 0 && today_date.getDate() < joining.getDate())
    ) {
        years_of_service--;
    }

    let yearly_leave = years_of_service > 5 ? 30 : 21;

    // First day of current month
    let first_day_of_month = new Date(
        today_date.getFullYear(),
        today_date.getMonth(),
        1
    );

    let from_date = new Date(frm.doc.from_date);

    // Days difference from first day of month to selected from_date
    let diff_time = from_date - first_day_of_month;
    let calculated_days = Math.ceil(diff_time / (1000 * 60 * 60 * 24));

    if (calculated_days < 0) calculated_days = 0;

    let forecasting_days = (yearly_leave / 365) * calculated_days;
    
    let custom_forcasted_leave = leave_balance + forecasting_days;

    frm.set_value("custom_forcasted_leave", custom_forcasted_leave.toFixed(2));
}