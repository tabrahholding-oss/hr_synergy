frappe.ui.form.on('Overtime Approval Request', {
    onload: function(frm) {
        apply_employee_filter(frm);
    },

    refresh: function(frm) {
        apply_employee_filter(frm);
        bind_row_date_options(frm);
        format_edit_date_column(frm);

        // --- Fetch Button ---
        if (frm.doc.docstatus === 0) {
            frm.add_custom_button(__('Fetch Overtime Records'), function() {
                if (!frm.doc.custom_company) {
                    frappe.throw(__('Please select a Company first.'));
                }
                frm.call({
                    method: 'fetch_overtime_records',
                    doc: frm.doc,
                    callback: function(r) {
                        frm.refresh_field('overtime_details');
                        hide_zero_in_ot_columns(frm);
                        format_edit_date_column(frm);
                    }
                });
            }, __('Actions'));
        }

        // --- Approve / Reject Buttons ---
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

        // Display blank instead of zero in OT columns (display only)
        hide_zero_in_ot_columns(frm);
    },

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
// Per-row OT Edit Date helpers
// ============================================================

function is_date_in_range(frm, date_str) {
    if (!date_str) return false;
    if (frm.doc.from_date && date_str < frm.doc.from_date) return false;
    if (frm.doc.to_date && date_str > frm.doc.to_date) return false;
    return true;
}

// Sorted attendance dates (YYYY-MM-DD) of a single row, limited to From/To Date
function get_row_dates(frm, row) {
    let dates = new Set();
    get_row_details(row).forEach(function(d) {
        if (d.attendance_date && is_date_in_range(frm, d.attendance_date)) {
            dates.add(d.attendance_date);
        }
    });
    return Array.from(dates).sort();
}

// Fill the OT Edit Date dropdown of one row with that row's own attendance dates
function set_row_edit_date_options(frm, cdn) {
    if (frm.doc.docstatus !== 0) return;

    try {
        let grid = frm.fields_dict.overtime_details.grid;
        let grid_row = grid.grid_rows_by_docname && grid.grid_rows_by_docname[cdn];
        let row = frappe.get_doc('Overtime Approval Request Item', cdn);
        if (!grid_row || !row) return;

        let options = [''].concat(get_row_dates(frm, row).map(function(d) {
            return { label: frappe.datetime.str_to_user(d), value: d };
        }));

        // Inline grid editor
        let field = grid_row.get_field('ot_edit_date');
        if (field) {
            field.df.options = options;
            field.refresh();
        }

        // Expanded row form
        let form_field = grid_row.grid_form
            && grid_row.grid_form.fields_dict
            && grid_row.grid_form.fields_dict.ot_edit_date;
        if (form_field) {
            form_field.df.options = options;
            form_field.refresh();
        }
    } catch (e) {
        console.error('set_row_edit_date_options error:', e);
    }
}

// Update the dropdown whenever the user activates a row
function bind_row_date_options(frm) {
    let field = frm.fields_dict.overtime_details;
    if (!field || !field.grid || !field.grid.wrapper) return;

    field.grid.wrapper.off('.otrow').on('focusin.otrow click.otrow', '.grid-row', function(e) {
        let $row = $(e.target).closest('.grid-row');
        let grid_row = $row.data('grid_row');
        let cdn = (grid_row && grid_row.doc && grid_row.doc.name) || $row.attr('data-name');
        if (!cdn) return;

        // Wait for the row editor to render its inputs
        setTimeout(function() { set_row_edit_date_options(frm, cdn); }, 50);
    });
}

// Show the date in the user's date format when the row is not being edited
function format_edit_date_column(frm) {
    try {
        let grid_field = frm.get_field('overtime_details');
        if (!grid_field || !grid_field.grid) return;

        let date_formatter = function(value, df, options, doc) {
            if (!value) return '';
            return frappe.datetime.str_to_user(value);
        };

        let df = frappe.meta.get_docfield('Overtime Approval Request Item', 'ot_edit_date');
        if (df && df.formatter !== date_formatter) {
            df.formatter = date_formatter;
        }

        (grid_field.grid.docfields || []).forEach(function(gdf) {
            if (gdf.fieldname === 'ot_edit_date' && gdf.formatter !== date_formatter) {
                gdf.formatter = date_formatter;
            }
        });

        grid_field.grid.refresh();
    } catch (e) {
        console.error('format_edit_date_column error:', e);
    }
}

// ============================================================
// Employee filters
// ============================================================
function apply_employee_filter(frm) {
    frm.set_query('employee', function() {
        return {
            filters: {
                'company': frm.doc.custom_company || "Please Select Company"
            }
        };
    });

    frm.set_query('employee', 'overtime_details', function() {
        return {
            filters: {
                'company': frm.doc.custom_company || "Please Select Company"
            }
        };
    });
}

// ============================================================
// Formatter: show blank instead of 0 in OT columns
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

        ot_fields.forEach(function(fieldname) {
            let df = frappe.meta.get_docfield('Overtime Approval Request Item', fieldname);
            if (df && df.formatter !== zero_blank_formatter) {
                df.formatter = zero_blank_formatter;
                changed = true;
            }
        });

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
// Helpers: attendance details JSON
// ============================================================
function get_row_details(row) {
    try {
        return JSON.parse(row.attendance_details || "[]");
    } catch (e) {
        return [];
    }
}

// Apply a row-level edit only to the day selected in that row's "OT Edit Date"
function sync_details_from_row(frm, cdt, cdn, fieldname) {
    let row = frappe.get_doc(cdt, cdn);
    let details = get_row_details(row);
    if (!details.length) return;

    let row_value = Math.max(flt(row[fieldname]), 0);
    let details_sum = details.reduce(function(s, d) { return s + flt(d[fieldname]); }, 0);
    let delta = flt(row_value - details_sum, 2);

    if (Math.abs(delta) <= 0.01) return;

    let revert = function() {
        frappe.model.set_value(cdt, cdn, fieldname, flt(details_sum, 2));
    };

    if (!row.ot_edit_date) {
        frappe.msgprint({
            title: __('OT Edit Date Required'),
            message: __('Please select an OT Edit Date in this row first. The change will be applied to that date only.'),
            indicator: 'orange'
        });
        revert();
        return;
    }

    let target = details.find(function(d) { return d.attendance_date === row.ot_edit_date; });
    if (!target) {
        frappe.msgprint({
            title: __('Attendance Not Found'),
            message: __('No attendance record exists on {0} for {1}.',
                [frappe.datetime.str_to_user(row.ot_edit_date), row.employee_name || row.employee]),
            indicator: 'orange'
        });
        revert();
        return;
    }

    let new_value = flt(flt(target[fieldname]) + delta, 2);
    if (new_value < 0) {
        frappe.msgprint({
            title: __('Invalid Value'),
            message: __('The value on {0} would become negative ({1}). This reduction is not possible for the selected date.',
                [frappe.datetime.str_to_user(row.ot_edit_date), new_value]),
            indicator: 'red'
        });
        revert();
        return;
    }

    target[fieldname] = new_value;
    frappe.model.set_value(cdt, cdn, 'attendance_details', JSON.stringify(details));
}

// ============================================================
// CHILD TABLE EVENTS
// ============================================================
frappe.ui.form.on('Overtime Approval Request Item', {

    // Expanded row form: load this row's dates into the dropdown
    form_render: function(frm, cdt, cdn) {
        setTimeout(function() { set_row_edit_date_options(frm, cdn); }, 50);
    },

    // Details button (editable popup)
    details: function(frm, cdt, cdn) {
        let row = frappe.get_doc(cdt, cdn);
        let details = get_row_details(row);

        if (!details.length) {
            frappe.msgprint(__('No details are available for this employee.'));
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
                   This row is a summary of ${details.length} attendance day(s).
                   You can edit the overtime hours for each day individually below.
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
                        errors.push(__('{0}: Negative values are not allowed.', [date_str]));
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

                // Update the JSON first, then the row values
                frappe.model.set_value(cdt, cdn, 'attendance_details', JSON.stringify(new_details));
                frappe.model.set_value(cdt, cdn, 'normal_ot_hours', normal);
                frappe.model.set_value(cdt, cdn, 'holiday_ot_hours', holiday);
                frappe.model.set_value(cdt, cdn, 'special_ot_hours', special);
                frappe.model.set_value(cdt, cdn, 'total_ot_hours', normal + holiday + special);

                d.hide();
                frm.refresh_field('overtime_details');
                hide_zero_in_ot_columns(frm);
                format_edit_date_column(frm);
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

    // Row edit -> applied only to this row's selected OT Edit Date
    normal_ot_hours: function(frm, cdt, cdn) {
        calculate_total_ot(frm, cdt, cdn);
        sync_details_from_row(frm, cdt, cdn, 'normal_ot_hours');
    },
    holiday_ot_hours: function(frm, cdt, cdn) {
        calculate_total_ot(frm, cdt, cdn);
        sync_details_from_row(frm, cdt, cdn, 'holiday_ot_hours');
    },
    special_ot_hours: function(frm, cdt, cdn) {
        calculate_total_ot(frm, cdt, cdn);
        sync_details_from_row(frm, cdt, cdn, 'special_ot_hours');
    }
});

// ============================================================
// Total OT calculation
// ============================================================
function calculate_total_ot(frm, cdt, cdn) {
    let row = frappe.get_doc(cdt, cdn);
    let total = (row.normal_ot_hours || 0) + (row.holiday_ot_hours || 0) + (row.special_ot_hours || 0);
    frappe.model.set_value(cdt, cdn, 'total_ot_hours', total);
}