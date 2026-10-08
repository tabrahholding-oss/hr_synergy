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
// Helpers: details JSON
// ============================================================
function get_row_details(row) {
    try {
        return JSON.parse(row.attendance_details || "[]");
    } catch (e) {
        return [];
    }
}

// Jin dinon mein Normal OT hai unki ginti (agar kisi din mein nahi to sab din)
function get_normal_days(details) {
    let n = details.filter(function(d) { return flt(d.normal_ot_hours) > 0; }).length;
    return n || details.length;
}

// Row ki edit ki hui values ko details (popup wale JSON) mein din-ba-din push karo
function sync_details_from_row(cdt, cdn) {
    let row = frappe.get_doc(cdt, cdn);
    let details = get_row_details(row);
    if (!details.length) return;

    let changed = false;

    // ---- Normal OT ----
    let days = details.filter(function(d) { return flt(d.normal_ot_hours) > 0; });
    if (!days.length) days = details;
    let n = days.length;
    let row_normal = flt(row.normal_ot_hours);
    let details_normal = details.reduce(function(s, d) { return s + flt(d.normal_ot_hours); }, 0);

    if (Math.abs(row_normal - details_normal) > 0.01) {
        details.forEach(function(d) { d.normal_ot_hours = 0; });
        if (row_normal > 0) {
            let share = flt(row_normal / n, 2);
            days.forEach(function(d, i) {
                d.normal_ot_hours = (i < n - 1) ? share : flt(row_normal - share * (n - 1), 2);
            });
        }
        changed = true;
    }

    // ---- Holiday / Special OT ----
    ['holiday_ot_hours', 'special_ot_hours'].forEach(function(f) {
        let row_value = Math.max(flt(row[f]), 0);
        let details_sum = details.reduce(function(s, d) { return s + flt(d[f]); }, 0);
        if (Math.abs(row_value - details_sum) <= 0.01) return;

        if (details_sum > 0) {
            let ratio = row_value / details_sum;
            details.forEach(function(d) { d[f] = flt(flt(d[f]) * ratio, 2); });
        } else {
            details.forEach(function(d, i) { d[f] = (i === 0) ? row_value : 0; });
        }
        changed = true;
    });

    if (changed) {
        frappe.model.set_value(cdt, cdn, 'attendance_details', JSON.stringify(details));
    }
}

// ============================================================
// CHILD TABLE EVENTS
// ============================================================
frappe.ui.form.on('Overtime Approval Request Item', {

    // 🔹 DETAILS BUTTON click handler (ab editable popup)
    details: function(frm, cdt, cdn) {
        let row = frappe.get_doc(cdt, cdn);
        let details = get_row_details(row);

        if (!details.length) {
            frappe.msgprint(__('Is employee ke liye koi detail available nahi hai.'));
            return;
        }

        let editable = frm.doc.docstatus === 0;

        let ot_cell = function(idx, field, value) {
            if (editable) {
                return `<td class="text-right" style="width:120px;">
                    <input type="number" step="0.01" min="0"
                        class="form-control input-sm text-right ot-input"
                        data-idx="${idx}" data-field="${field}"
                        value="${flt(value).toFixed(2)}">
                </td>`;
            }
            return `<td class="text-right">${flt(value).toFixed(2)}</td>`;
        };

        let total_wh = 0;
        let rows_html = details.map(function(d, i) {
            total_wh += flt(d.working_hours);
            return `
                <tr>
                    <td>${frappe.datetime.str_to_user(d.attendance_date)}</td>
                    <td class="text-right">${flt(d.working_hours).toFixed(2)}</td>
                    ${ot_cell(i, 'normal_ot_hours', d.normal_ot_hours)}
                    ${ot_cell(i, 'holiday_ot_hours', d.holiday_ot_hours)}
                    ${ot_cell(i, 'special_ot_hours', d.special_ot_hours)}
                    <td>${frappe.utils.escape_html(d.project || '')}</td>
                </tr>`;
        }).join("");

        let hint = editable
            ? `<div class="text-muted small" style="margin-bottom:8px;">
                   ${details.length} din ki attendance mil kar ye row bani hai.
                   Normal OT har din 0 ya 1 se 3 ke darmiyan hona chahiye.
               </div>`
            : '';

        let html = `
            ${hint}
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
                        <td class="text-right ot-total" data-field="normal_ot_hours"></td>
                        <td class="text-right ot-total" data-field="holiday_ot_hours"></td>
                        <td class="text-right ot-total" data-field="special_ot_hours"></td>
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
            primary_action_label: editable ? __('Save') : __('Close'),
            primary_action: function() {
                if (!editable) {
                    d.hide();
                    return;
                }

                let new_details = JSON.parse(JSON.stringify(details));
                let errors = [];

                d.$wrapper.find('.ot-input').each(function() {
                    let idx = $(this).data('idx');
                    let field = $(this).data('field');
                    let value = flt($(this).val());
                    let date_str = frappe.datetime.str_to_user(new_details[idx].attendance_date);

                    if (value < 0) {
                        errors.push(__('{0}: negative value allowed nahi hai', [date_str]));
                    }
                    if (field === 'normal_ot_hours' && value > 0 && value < 1) {
                        errors.push(__('{0}: Normal OT 0 ya kam az kam 1 hona chahiye', [date_str]));
                    }
                    if (field === 'normal_ot_hours' && value > 3) {
                        errors.push(__('{0}: Normal OT ki max limit 3 hai', [date_str]));
                    }
                    new_details[idx][field] = value;
                });

                if (errors.length) {
                    frappe.msgprint({
                        title: __('Invalid Values'),
                        message: errors.join('<br>'),
                        indicator: 'red'
                    });
                    return;
                }

                let sum_of = function(field) {
                    return flt(new_details.reduce(function(s, x) { return s + flt(x[field]); }, 0), 2);
                };
                let normal = sum_of('normal_ot_hours');
                let holiday = sum_of('holiday_ot_hours');
                let special = sum_of('special_ot_hours');

                // Pehle JSON, phir row ki values
                frappe.model.set_value(cdt, cdn, 'attendance_details', JSON.stringify(new_details));
                frappe.model.set_value(cdt, cdn, 'normal_ot_hours', normal);
                frappe.model.set_value(cdt, cdn, 'holiday_ot_hours', holiday);
                frappe.model.set_value(cdt, cdn, 'special_ot_hours', special);
                frappe.model.set_value(cdt, cdn, 'total_ot_hours', normal + holiday + special);

                d.hide();
                frm.refresh_field('overtime_details');
                hide_zero_in_ot_columns(frm);
            }
        });

        d.show();

        // Live totals
        let recalc_totals = function() {
            ['normal_ot_hours', 'holiday_ot_hours', 'special_ot_hours'].forEach(function(f) {
                let total = 0;
                if (editable) {
                    d.$wrapper.find('.ot-input[data-field="' + f + '"]').each(function() {
                        total += flt($(this).val());
                    });
                } else {
                    total = details.reduce(function(s, x) { return s + flt(x[f]); }, 0);
                }
                d.$wrapper.find('.ot-total[data-field="' + f + '"]').text(total.toFixed(2));
            });
        };
        recalc_totals();
        d.$wrapper.on('input change', '.ot-input', recalc_totals);
    },

    // Existing calculations
    normal_ot_hours: function(frm, cdt, cdn) {
        let row = frappe.get_doc(cdt, cdn);
        let value = flt(row.normal_ot_hours);
        let details = get_row_details(row);

        if (!details.length) {
            // Details nahi hain: purani 1-3 limit
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
        } else {
            // Limit: kam se kam = din, zyada se zyada = 3 x din
            let n = get_normal_days(details);
            let min_limit = n;
            let max_limit = 3 * n;

            if (value > 0 && value < min_limit) {
                frappe.model.set_value(cdt, cdn, 'normal_ot_hours', 0);
                frappe.show_alert({
                    message: __('Normal OT Hours {0} din ke liye kam az kam {1} honi chahiye, 0 kar diya gaya hai', [n, min_limit]),
                    indicator: 'orange'
                });
                return;
            }
            if (value > max_limit) {
                frappe.model.set_value(cdt, cdn, 'normal_ot_hours', max_limit);
                frappe.show_alert({
                    message: __('Normal OT Hours ki max limit {0} din ke liye {1} hai, {1} kar diya gaya hai', [n, max_limit]),
                    indicator: 'orange'
                });
                return;
            }
        }

        calculate_total_ot(frm, cdt, cdn);
        sync_details_from_row(cdt, cdn);
    },
    holiday_ot_hours: function(frm, cdt, cdn) {
        calculate_total_ot(frm, cdt, cdn);
        sync_details_from_row(cdt, cdn);
    },
    special_ot_hours: function(frm, cdt, cdn) {
        calculate_total_ot(frm, cdt, cdn);
        sync_details_from_row(cdt, cdn);
    }
});

// ============================================================
// Total OT calculate function
// ============================================================
function calculate_total_ot(frm, cdt, cdn) {
    let row = frappe.get_doc(cdt, cdn);
    let total = (row.normal_ot_hours || 0) + (row.holiday_ot_hours || 0) + (row.special_ot_hours || 0);
    frappe.model.set_value(cdt, cdn, 'total_ot_hours', total);
}