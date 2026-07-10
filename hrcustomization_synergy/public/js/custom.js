// frappe.ui.form.on("Stock Entry", {

//     // =========================
//     // VALIDATION SECTION
//     // =========================
//     validate: async function (frm) {

//         // -------------------------
//         // 1. Same Company Check
//         // -------------------------
//         if (
//             frm.doc.custom_source_company &&
//             frm.doc.custom_target_company &&
//             frm.doc.custom_source_company === frm.doc.custom_target_company
//         ) {
//             frappe.throw(__("Source Company and Target Company cannot be same"));
//         }

//         // -------------------------
//         // 2. Source Warehouse Check
//         // -------------------------
//         if (frm.doc.custom_source_warehouse) {

//             let source = await frappe.db.get_value(
//                 "Warehouse",
//                 frm.doc.custom_source_warehouse,
//                 "company"
//             );

//             if (source.message.company !== frm.doc.custom_source_company) {
//                 frappe.throw(__("Source Warehouse does not belong to Source Company"));
//             }
//         }

//         // -------------------------
//         // 3. Target Warehouse Check
//         // -------------------------
//         if (frm.doc.custom_target_warehouse) {

//             let target = await frappe.db.get_value(
//                 "Warehouse",
//                 frm.doc.custom_target_warehouse,
//                 "company"
//             );

//             if (target.message.company !== frm.doc.custom_target_company) {
//                 frappe.throw(__("Target Warehouse does not belong to Target Company"));
//             }
//         }

//         // -------------------------
//         // 4. Stock Availability Check
//         // -------------------------
//         let item = (frm.doc.items || [])[0];
//         if (!item) return;

//         let r = await frappe.call({
//             method: "frappe.client.get_value",
//             args: {
//                 doctype: "Bin",
//                 filters: {
//                     item_code: item.item_code,
//                     warehouse: frm.doc.custom_source_warehouse
//                 },
//                 fieldname: "actual_qty"
//             }
//         });

//         let available = r.message ? (r.message.actual_qty || 0) : 0;
//         let required = item.qty || 0;

//         if (available < required) {
//             frappe.throw(
//                 `Insufficient Stock for ${item.item_code}: Available ${available}, Required ${required}`
//             );
//         }
//     },

//     // =========================
//     // MAIN ACTION BUTTON
//     // =========================
//     refresh: function (frm) {

//         if (
//             frm.doc.custom_source_company &&
//             frm.doc.custom_target_company
//         ) {

//             frm.add_custom_button("Process Intercompany Transfer", async function () {

//                 frappe.msgprint("Processing Intercompany Transfer...");

//                 // =========================
//                 // 1. MATERIAL ISSUE
//                 // =========================
//                 let issue = await frappe.call({
//                     method: "frappe.client.insert",
//                     args: {
//                         doc: {
//                             doctype: "Stock Entry",
//                             stock_entry_type: "Material Issue",
//                             purpose: "Material Issue",
//                             company: frm.doc.custom_source_company,
//                             items: frm.doc.items.map(i => ({
//                                 item_code: i.item_code,
//                                 qty: i.qty,
//                                 s_warehouse: frm.doc.custom_source_warehouse
//                             }))
//                         }
//                     }
//                 });

//                 console.log("Issue Created:", issue.message);

//                 // =========================
//                 // 2. MATERIAL RECEIPT
//                 // =========================
//                 let receipt = await frappe.call({
//                     method: "frappe.client.insert",
//                     args: {
//                         doc: {
//                             doctype: "Stock Entry",
//                             stock_entry_type: "Material Receipt",
//                             purpose: "Material Receipt",
//                             company: frm.doc.custom_target_company,
//                             items: frm.doc.items.map(i => ({
//                                 item_code: i.item_code,
//                                 qty: i.qty,
//                                 t_warehouse: frm.doc.custom_target_warehouse,

//                                 // IMPORTANT:
//                                 // valuation_rate yahan force inject karna hai (future enhancement)
//                                 // valuation_rate: issue_rate
//                             }))
//                         }
//                     }
//                 });

//                 console.log("Receipt Created:", receipt.message);

//                 frappe.msgprint("Intercompany Transfer Completed Successfully");

//                 frm.reload_doc();
//             });
//         }
//     }
// });


// frappe.ui.form.on("Leave Application", {
//     leave_type(frm) {
//         calculate_forecasted_leave(frm);
//     },

//     from_date(frm) {
//         calculate_forecasted_leave(frm);
//     },

//     employee(frm) {
//         calculate_forecasted_leave(frm);
//     }
// });

// function to_flt(value) {
//     return parseFloat(value || 0) || 0;
// }

// // Function to calculate leave balance including Leave Adjustment and Carry Forward
// async function get_leave_balance(employee, leave_type, target_date) {
//     if (!employee || !leave_type || !target_date) return 0;

//     // Get Leave Allocation valid for the selected from_date
//     let allocations = await frappe.db.get_list("Leave Allocation", {
//         filters: [
//             ["employee", "=", employee],
//             ["leave_type", "=", leave_type],
//             ["docstatus", "=", 1],
//             ["from_date", "<=", target_date],
//             ["to_date", ">=", target_date]
//         ],
//         fields: [
//             "name",
//             "from_date",
//             "to_date",
//             "total_leaves_allocated",
//             "carry_forwarded_leaves_count"
//         ],
//         order_by: "from_date desc",
//         limit_page_length: 1
//     });

//     if (!allocations || allocations.length === 0) {
//         return 0;
//     }

//     let allocation = allocations[0];

//     // Get all Leave Ledger Entries inside this allocation period up to target date
//     let ledger_entries = await frappe.db.get_list("Leave Ledger Entry", {
//         filters: [
//             ["employee", "=", employee],
//             ["leave_type", "=", leave_type],
//             ["docstatus", "=", 1],
//             ["is_expired", "=", 0],
//             ["is_lwp", "=", 0],
//             ["from_date", "<=", target_date],
//             ["to_date", ">=", allocation.from_date],
//             ["transaction_type", "in", [
//                 "Leave Allocation",
//                 "Leave Application",
//                 "Leave Adjustment"
//             ]]
//         ],
//         fields: [
//             "leaves",
//             "transaction_type",
//             "transaction_name",
//             "from_date",
//             "to_date",
//             "is_carry_forward"
//         ],
//         order_by: "from_date asc",
//         limit_page_length: 500
//     });

//     let leave_balance = 0;

//     if (ledger_entries && ledger_entries.length) {
//         ledger_entries.forEach(row => {
//             let leaves = to_flt(row.leaves);

//             // FIX: Allow both regular allocations AND carry-forward leaves to build the base balance
//             if (row.transaction_type === "Leave Allocation") {
//                 leave_balance += leaves;
//             }

//             // Leave Adjustment can be positive or negative
//             if (row.transaction_type === "Leave Adjustment") {
//                 leave_balance += leaves;
//             }

//             // Leave Applications deduct from the balance
//             if (row.transaction_type === "Leave Application") {
//                 leave_balance += leaves;
//             }
//         });
//     }
//     return leave_balance;
// }

// // Calculate forecasted leave
// async function calculate_forecasted_leave(frm) {
//     if (frm.doc.leave_type !== "Annual Leave" || !frm.doc.from_date || !frm.doc.employee) {
//         frm.set_value("custom_forcasted_leave", 0);
//         return;
//     }

//     let leave_balance = await get_leave_balance(
//         frm.doc.employee,
//         frm.doc.leave_type,
//         frm.doc.from_date
//     );

//     // Get employee joining date
//     let emp = await frappe.db.get_value("Employee", frm.doc.employee, [
//         "date_of_joining",
//         "relieving_date"
//     ]);

//     // Handle variation in how frappe returns db values based on framework versions
//     let data = emp.message ? emp.message : emp;
//     let joining_date = data.date_of_joining || frm.doc.date_of_joining || frm.doc.joining_date;

//     if (!joining_date) {
//         frappe.msgprint("Joining Date is missing for the employee.");
//         frm.set_value("custom_forcasted_leave", leave_balance.toFixed(2));
//         return;
//     }

//     // Years of service
//     let today_date = new Date(frappe.datetime.get_today());
//     let joining = new Date(joining_date);

//     let years_of_service = today_date.getFullYear() - joining.getFullYear();
//     let month_diff = today_date.getMonth() - joining.getMonth();

//     if (
//         month_diff < 0 ||
//         (month_diff === 0 && today_date.getDate() < joining.getDate())
//     ) {
//         years_of_service--;
//     }

//     let yearly_leave = years_of_service > 5 ? 30 : 21;

//     // First day of current month
//     let first_day_of_month = new Date(
//         today_date.getFullYear(),
//         today_date.getMonth(),
//         1
//     );

//     let from_date = new Date(frm.doc.from_date);

//     // Days difference from first day of month to selected from_date
//     let diff_time = from_date - first_day_of_month;
//     let calculated_days = Math.ceil(diff_time / (1000 * 60 * 60 * 24));

//     if (calculated_days < 0) calculated_days = 0;

//     let forecasting_days = (yearly_leave / 365) * calculated_days;
    
//     let custom_forcasted_leave = leave_balance + forecasting_days;

//     frm.set_value("custom_forcasted_leave", custom_forcasted_leave.toFixed(2));
// }














// export class LeaveApplication {
//     // Triggers when leave_type changes
//     async leave_type() {
//         await this.calculate_forecasted_leave();
//     }

//     // Triggers when from_date changes
//     async from_date() {
//         await this.calculate_forecasted_leave();
//     }

//     // Triggers when employee changes
//     async employee() {
//         await this.calculate_forecasted_leave();
//     }

//     // Helper to convert values to float
//     to_flt(value) {
//         return parseFloat(value || 0) || 0;
//     }

//     // Main calculation logic
//     async calculate_forecasted_leave() {
//         const doc = this.doc;

//         if (doc.leave_type !== "Annual Leave" || !doc.from_date || !doc.employee) {
//             doc.custom_forcasted_leave = 0;
//             return;
//         }

//         // 1. Get Leave Balance
//         let leave_balance = await this.get_leave_balance(
//             doc.employee,
//             doc.leave_type,
//             doc.from_date
//         );

//         // 2. Get Employee Joining Date
//         let emp = await call("frappe.client.get_value", {
//             doctype: "Employee",
//             filters: { name: doc.employee },
//             fieldname: ["date_of_joining", "relieving_date"]
//         });

//         let joining_date = emp.date_of_joining;

//         if (!joining_date) {
//             // Using toast instead of msgprint for better UX in Vue UI
//             toast.error("Joining Date is missing for the employee.");
//             doc.custom_forcasted_leave = leave_balance.toFixed(2);
//             return;
//         }

//         // 3. Calculate Years of Service
//         let today_date = new Date(); // Use standard JS Date or frappe.datetime if available
//         let joining = new Date(joining_date);

//         let years_of_service = today_date.getFullYear() - joining.getFullYear();
//         let month_diff = today_date.getMonth() - joining.getMonth();

//         if (
//             month_diff < 0 ||
//             (month_diff === 0 && today_date.getDate() < joining.getDate())
//         ) {
//             years_of_service--;
//         }

//         let yearly_leave = years_of_service > 5 ? 30 : 21;

//         // 4. Calculate Days Difference
//         let first_day_of_month = new Date(
//             today_date.getFullYear(),
//             today_date.getMonth(),
//             1
//         );

//         let from_date = new Date(doc.from_date);
//         let diff_time = from_date - first_day_of_month;
//         let calculated_days = Math.ceil(diff_time / (1000 * 60 * 60 * 24));

//         if (calculated_days < 0) calculated_days = 0;

//         // 5. Calculate Forecasting
//         let forecasting_days = (yearly_leave / 365) * calculated_days;
//         let custom_forcasted_leave = leave_balance + forecasting_days;

//         // Set value reactively
//         doc.custom_forcasted_leave = custom_forcasted_leave.toFixed(2);
//     }

//     // Helper to fetch leave balance
//     async get_leave_balance(employee, leave_type, target_date) {
//         if (!employee || !leave_type || !target_date) return 0;

//         // Fetch Leave Allocation
//         let allocations = await call("frappe.client.get_list", {
//             doctype: "Leave Allocation",
//             filters: {
//                 employee: employee,
//                 leave_type: leave_type,
//                 docstatus: 1,
//                 from_date: ["<=", target_date],
//                 to_date: [">=", target_date]
//             },
//             fields: ["name", "from_date", "to_date"],
//             order_by: "from_date desc",
//             limit: 1
//         });

//         if (!allocations || allocations.length === 0) return 0;
//         let allocation = allocations[0];

//         // Fetch Ledger Entries
//         let ledger_entries = await call("frappe.client.get_list", {
//             doctype: "Leave Ledger Entry",
//             filters: {
//                 employee: employee,
//                 leave_type: leave_type,
//                 docstatus: 1,
//                 is_expired: 0,
//                 is_lwp: 0,
//                 from_date: ["<=", target_date],
//                 to_date: [">=", allocation.from_date],
//                 transaction_type: ["in", ["Leave Allocation", "Leave Application", "Leave Adjustment"]]
//             },
//             fields: ["leaves", "transaction_type"]
//         });

//         let leave_balance = 0;
//         if (ledger_entries && ledger_entries.length) {
//             ledger_entries.forEach(row => {
//                 let leaves = this.to_flt(row.leaves);
//                 // In Ledger, applications are usually negative, so we just add
//                 leave_balance += leaves;
//             });
//         }
//         return leave_balance;
//     }
// }
frappe.ui.form.on("Stock Entry", {
    refresh(frm) {
        toggle_issue_reason_code(frm);
    },

    stock_entry_type(frm) {
        toggle_issue_reason_code(frm);
    }
});

function toggle_issue_reason_code(frm) {
    const hidden = frm.doc.stock_entry_type !== "Production";

    frm.fields_dict.items.grid.update_docfield_property(
        "custom_issue_reason_code",
        "hidden",
        hidden
    );

    frm.fields_dict.items.grid.reset_grid();
    frm.refresh_field("items");
}

frappe.ui.form.on("Leave Application", {

    leave_type(frm) {
        calculate_custom_forcasted_leave(frm);
    },

    from_date(frm) {
        calculate_custom_forcasted_leave(frm);
    },

    employee(frm) {
        calculate_custom_forcasted_leave(frm);
    }
});

function to_flt(value) {
    return parseFloat(value || 0) || 0;
}

// Ab ye function frappe.db.get_list() k bajaye humare whitelisted
// server method ko call karta hai (ignore_permissions=True k sath),
// isliye Administrator ho ya Employee khud login ho, result hamesha same aayega.
async function get_leave_balance(employee, leave_type, target_date) {
    if (!employee || !leave_type || !target_date) return 0;

    let r = await frappe.call({
        // ATTENTION: apni app ka actual dotted path yahan dalein
        method: "hrcustomization_synergy.overrides.leave_application.get_forecasted_leave_balance",
        args: {
            employee: employee,
            leave_type: leave_type,
            target_date: target_date
        }
    });

    return to_flt(r.message);
}

async function get_employee_joining_info(employee) {
    let r = await frappe.call({
        method: "hrcustomization_synergy.overrides.leave_application.get_employee_joining_info",
        args: { employee: employee }
    });
    return r.message || {};
}

// Calculate forecasted leave
async function calculate_custom_forcasted_leave(frm) {
    if (frm.doc.leave_type !== "Annual Leave" || !frm.doc.from_date || !frm.doc.employee) {
        frm.set_value("custom_forcasted_leave", 0);
        return;
    }

    let leave_balance = await get_leave_balance(
        frm.doc.employee,
        frm.doc.leave_type,
        frm.doc.from_date
    );

    // Get employee joining date (server-side, permission-safe)
    let emp = await get_employee_joining_info(frm.doc.employee);

    let joining_date = emp.date_of_joining || frm.doc.date_of_joining || frm.doc.joining_date;

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


frappe.ui.form.on('Certificate Request Detail', {
    employee(frm) {
        auto_fetch_salary_components(frm);
    },

    certificate_type(frm) {
        frm.set_value('resignation_letter_date', '');
        frm.set_value('custom_country', '');
        frm.clear_table('warning_details');
        frm.clear_table('salary_component');
        frm.refresh_field('warning_details');
        frm.refresh_field('salary_component');

        auto_fetch_salary_components(frm);
    },

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
    }
});

function open_print(frm, is_preview) {
    const format_map = {
        "Salary Certificate QDC": "Salary Certificate QDC",
        "Salary Certificate CBQ Card": "Salary Certificate CBQ Card",
        "Salary Certificate CBQ": "Salary Certificate CBQ",
        "Salary Certificate": "Salary Certificate",
        "Experience Letter": "Experience Letter",
        "Termination Letter": "Termination Letter",
        "Non Confirmation Letter": "Non Confirmation Letter",
        "Employment Certificate": "Employment Certificate",
        "Warning Letter": "Warning Letter",
        "Salary Increment": "Salary Increment Letter"
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
    if (!frm.doc.employee || frm.doc.certificate_type !== "Salary Increment") return;

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
                        { label: 'Other Allowance', value: a.custom_total_salary && a.base
                            ? (flt(a.custom_total_salary) - (flt(a.base) + flt(a.custom_hra || 0))) : 0 }
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