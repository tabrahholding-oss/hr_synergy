frappe.ui.form.on('Overtime Approval Request', {
    onload: function(frm) {
        // Filter apply karein jab form load ho
        apply_employee_filter(frm);
    },

    refresh: function(frm) {
        // Filter apply karein jab form refresh ho
        apply_employee_filter(frm);

        // --- Aapka Fetch Button Code (Waisa hi hai) ---
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
                    }
                });
            }, __('Actions'));
        }
        
        // Approve/Reject Buttons logic (Baqi code waisa hi rahega)
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
    },

    // Jab company change ho to filter foran update ho
    custom_company: function(frm) {
        apply_employee_filter(frm);
        // Company badalne par employee field clear kar dein taake ghalat selection na ho
        frm.set_value('employee', '');
    },
    
    from_date: function(frm) {
        if (frm.doc.from_date && !frm.doc.to_date) {
            frm.set_value('to_date', frm.doc.from_date);
        }
    }
});

// Filter Function (Alag se)
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

// Child Table Calculations (Waisa hi hai)
frappe.ui.form.on('Overtime Approval Request Item', {
    normal_ot_hours: function(frm, cdt, cdn) { calculate_total_ot(frm, cdt, cdn); },
    holiday_ot_hours: function(frm, cdt, cdn) { calculate_total_ot(frm, cdt, cdn); },
    special_ot_hours: function(frm, cdt, cdn) { calculate_total_ot(frm, cdt, cdn); }
});

function calculate_total_ot(frm, cdt, cdn) {
    let row = frappe.get_doc(cdt, cdn);
    let total = (row.normal_ot_hours || 0) + (row.holiday_ot_hours || 0) + (row.special_ot_hours || 0);
    frappe.model.set_value(cdt, cdn, 'total_ot_hours', total);
}