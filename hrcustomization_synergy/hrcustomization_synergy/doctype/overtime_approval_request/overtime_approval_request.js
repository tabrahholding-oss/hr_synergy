frappe.ui.form.on('Overtime Approval Request', {
    onload: function(frm) {
        // Filter apply karein jab form load ho
        apply_employee_filter(frm);
    },

    refresh: function(frm) {
        // Filter apply karein jab form refresh ho
        apply_employee_filter(frm);

        // --- Fetch Button Code ---
        if (frm.doc.docstatus === 0) {
            frm.add_custom_button(__('Fetch Overtime Records'), function() {
                if (!frm.doc.custom_company) {
                    frappe.throw(__('Please select a Company first!'));
                }
                frm.call({
                    method: 'fetch_overtime_records',
                    doc: frm.doc,
                    callback: function(r) {
                        frm.refresh_field('overtime_details');
                        hide_zero_in_ot_columns(frm);
                    }
                });
            }, __('Actions'));
        }

        // Approve/Reject Buttons logic
        if (frm.doc.docstatus === 0 && frm.doc.overtime_details && frm.doc.overtime_details.length > 0) {
            frm.add_custom_button(__('Approve'), function() {
                frm.set_value('status', 'Approved');
                frm.set_value('approver', frappe.session.user);
                frm.set_value('approval_date', frappe.datetime.get_today());
                frm.save();
            }, __('Actions'));

            frm.add_custom_button(__('Reject'), function() {
                frappe.prompt({
                    label: 'Rejection Comments',
                    fieldname: 'comments',
                    fieldtype: 'Small Text',
                    reqd: 1
                }, function(values) {
                    frm.set_value('status', 'Rejected');
                    frm.set_value('comments', values.comments);
                    frm.set_value('approver', frappe.session.user);
                    frm.set_value('approval_date', frappe.datetime.get_today());
                    frm.save();
                });
            }, __('Actions'));
        }

        // OT columns mein zero ki jagah khali dikhayen (sirf display)
        hide_zero_in_ot_columns(frm);
    },

    // Jab company change ho to filter foran update ho
    custom_company: function(frm) {
        apply_employee_filter(frm);
        frm.set_value('employee', '');
    },

    from_date: function(frm) {
        if (frm.doc.from_date && !frm.doc.to_date) {
            frm.set_value('to_date', frm.doc.from_date);
        }
    }
});

// ============================================================
// Filter Function (Alag se)
// ============================================================
function apply_employee_filter(frm) {
    // 1. Main Form ki Employee field ke liye
    frm.set_query('employee', function() {
        return {
            filters: {
                'company': frm.doc.custom_company || "Please Select Company"
            }
        };
    });

    // 2. Child Table ki Employee field ke liye
    frm.set_query('employee', 'overtime_details', function() {
        return {
            filters: {
                'company': frm.doc.custom_company || "Please Select Company"
            }
        };
    });
}

// ============================================================
// OT columns mein 0 ki jagah khali dikhane ka formatter
// ============================================================
function hide_zero_in_ot_columns(frm) {
    try {
        let grid_field = frm.get_field('overtime_details');
        if (!grid_field || !grid_field.grid) return;

        let ot_fields = [
            'working_hours',
            'normal_ot_hours',
            'holiday_ot_hours',
            'special_ot_hours',
            'total_ot_hours'
        ];

        let zero_blank_formatter = function(value, df, options, doc) {
            if (flt(value) === 0) {
                return '';
            }
            let default_formatter = frappe.form.get_formatter(df.fieldtype);
            return default_formatter(value, df, options, doc);
        };

        let changed = false;

        // Meta docfields pe formatter lagayen
        ot_fields.forEach(function(fieldname) {
            let df = frappe.meta.get_docfield('Overtime Approval Request Item', fieldname);
            if (df && df.formatter !== zero_blank_formatter) {
                df.formatter = zero_blank_formatter;
                changed = true;
            }
        });

        // Grid ke apne docfields pe bhi lagayen
        (grid_field.grid.docfields || []).forEach(function(df) {
            if (ot_fields.includes(df.fieldname) && df.formatter !== zero_blank_formatter) {
                df.formatter = zero_blank_formatter;
                changed = true;
            }
        });

        if (changed) {
            grid_field.grid.refresh();
        }
    } catch (e) {
        console.error('hide_zero_in_ot_columns error:', e);
    }
}

// ============================================================
// CHILD TABLE EVENTS
// ============================================================
frappe.ui.form.on('Overtime Approval Request Item', {

    // 🔹 DETAILS BUTTON click handler
    details: function(frm, cdt, cdn) {
        let row = frappe.get_doc(cdt, cdn);

        let details = [];
        try {
            details = JSON.parse(row.attendance_details || "[]");
        } catch (e) {
            details = [];
        }

        if (!details.length) {
            frappe.msgprint(__('Is employee ke liye koi detail available nahi hai.'));
            return;
        }

        let total_wh = 0, total_no = 0, total_ho = 0, total_so = 0;

        let rows_html = details.map(function(d) {
            let wh = flt(d.working_hours);
            let no = flt(d.normal_ot_hours);
            let ho = flt(d.holiday_ot_hours);
            let so = flt(d.special_ot_hours);

            total_wh += wh;
            total_no += no;
            total_ho += ho;
            total_so += so;

            return `
                <tr>
                    <td>${frappe.datetime.str_to_user(d.attendance_date)}</td>
                    <td class="text-right">${wh.toFixed(2)}</td>
                    <td class="text-right">${no.toFixed(2)}</td>
                    <td class="text-right">${ho.toFixed(2)}</td>
                    <td class="text-right">${so.toFixed(2)}</td>
                    <td>${frappe.utils.escape_html(d.project || '')}</td>
                </tr>`;
        }).join("");

        let html = `
            <div style="max-height:450px; overflow:auto;">
            <table class="table table-bordered table-sm" style="margin-bottom:0;">
                <thead style="background:#f5f5f5;">
                    <tr>
                        <th>Date</th>
                        <th class="text-right">Working Hrs</th>
                        <th class="text-right">Normal OT</th>
                        <th class="text-right">Holiday OT</th>
                        <th class="text-right">Special OT</th>
                        <th>Project</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows_html}
                    <tr style="font-weight:bold; background:#eef6ff;">
                        <td>Total</td>
                        <td class="text-right">${total_wh.toFixed(2)}</td>
                        <td class="text-right">${total_no.toFixed(2)}</td>
                        <td class="text-right">${total_ho.toFixed(2)}</td>
                        <td class="text-right">${total_so.toFixed(2)}</td>
                        <td></td>
                    </tr>
                </tbody>
            </table>
            </div>
        `;

        let d = new frappe.ui.Dialog({
            title: __('Overtime Details - {0}', [row.employee_name || row.employee]),
            size: 'large',
            fields: [
                { fieldtype: 'HTML', options: html }
            ],
            primary_action_label: __('Close'),
            primary_action: function() { d.hide(); }
        });
        d.show();
    },

    // Existing calculations
    normal_ot_hours: function(frm, cdt, cdn) {
        let row = frappe.get_doc(cdt, cdn);
        let value = flt(row.normal_ot_hours);

        if (value > 0 && value < 1) {
            frappe.model.set_value(cdt, cdn, 'normal_ot_hours', 0);
            frappe.show_alert({
                message: __('Normal OT Hours 1 se kam nahi ho sakti, 0 kar diya gaya hai'),
                indicator: 'orange'
            });
            return;
        }

        if (value > 3) {
            frappe.model.set_value(cdt, cdn, 'normal_ot_hours', 3);
            frappe.show_alert({
                message: __('Normal OT Hours ki max limit 3 hai, 3 kar diya gaya hai'),
                indicator: 'orange'
            });
            return;
        }

        calculate_total_ot(frm, cdt, cdn);
    },
    holiday_ot_hours: function(frm, cdt, cdn) { calculate_total_ot(frm, cdt, cdn); },
    special_ot_hours: function(frm, cdt, cdn) { calculate_total_ot(frm, cdt, cdn); }
});

// ============================================================
// Total OT calculate function
// ============================================================
function calculate_total_ot(frm, cdt, cdn) {
    let row = frappe.get_doc(cdt, cdn);
    let total = (row.normal_ot_hours || 0) + (row.holiday_ot_hours || 0) + (row.special_ot_hours || 0);
    frappe.model.set_value(cdt, cdn, 'total_ot_hours', total);
}