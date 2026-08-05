frappe.ui.form.on('Overtime Settings', {
    refresh: function(frm) {
        frm.set_intro('Configure overtime calculation and approval settings for attendance records.<br><br>' +
                      '<strong>Note:</strong> Only employees with "Overtime Eligible" checkbox enabled in Employee master will be considered for overtime calculation.<br><br>' +
                      '<strong>Break Time Example:</strong> If an employee works 9 hours (attendance time) with 1 hour break, ' +
                      'effective working time is 8 hours. With 8-hour threshold, no overtime is calculated.<br><br>' +
                      '<strong>Minimum Thresholds:</strong> Prevents small delays (checkout queues, traffic) from counting as overtime.<br>' +
                      'Example: 0.25 hours = 15 minutes minimum to avoid checkout queue delays.');
    },
    
    daily_break_hours: function(frm) {
        if (frm.doc.daily_break_hours >= frm.doc.daily_working_hours_threshold) {
            frappe.msgprint({
                title: 'Invalid Break Hours',
                message: 'Break hours cannot be equal to or greater than working hours threshold',
                indicator: 'red'
            });
        }
    },
    
    minimum_normal_ot: function(frm) {
        show_time_conversion_helper(frm.doc.minimum_normal_ot, 'Normal OT');
    },
    
    minimum_holiday_ot: function(frm) {
        show_time_conversion_helper(frm.doc.minimum_holiday_ot, 'Holiday OT');
    },
    
    minimum_special_ot: function(frm) {
        show_time_conversion_helper(frm.doc.minimum_special_ot, 'Special OT');
    }
});

function show_time_conversion_helper(hours, type) {
    if (hours) {
        let minutes = Math.round(hours * 60);
        frappe.show_alert({
            message: `${type} Minimum: ${hours} hours = ${minutes} minutes`,
            indicator: 'blue'
        }, 3);
    }
}