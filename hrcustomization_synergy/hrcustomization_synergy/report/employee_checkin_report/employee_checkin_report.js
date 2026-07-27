// Copyright (c) 2026, NexTash and contributors
// For license information, please see license.txt

frappe.query_reports["Employee Checkin Report"] = {
    "filters": [
        {
            "fieldname": "from_date",
            "label": __("From Date"),
            "fieldtype": "Date",
            "default": frappe.datetime.add_months(frappe.datetime.get_today(), -1),
            "reqd": 1
        },
        {
            "fieldname": "to_date",
            "label": __("To Date"),
            "fieldtype": "Date",
            "default": frappe.datetime.get_today(),
            "reqd": 1
        },
        {
            "fieldname": "employee",
            "label": __("Employee"),
            "fieldtype": "Link",
            "options": "Employee"
        },
        {
            "fieldname": "department",
            "label": __("Department"),
            "fieldtype": "Link",
            "options": "Department"
        },
        {
            "fieldname": "project",
            "label": __("Project"),
            "fieldtype": "Link",
            "options": "Project"
        },
        {
            "fieldname": "shift",
            "label": __("Shift"),
            "fieldtype": "Link",
            "options": "Shift Type"
        },
        {
            "fieldname": "status",
            "label": __("Status"),
            "fieldtype": "Select",
            "options": "\nPresent\nAbsent\nHalf Day\nWork From Home\nOn Leave"
        }
    ],
    
    "formatter": function(value, row, column, data, default_formatter) {
        value = default_formatter(value, row, column, data);
        
        if (column.fieldname == "status" && data) {
            if (data.status === "Present") {
                value = "<span style='color: green'>" + value + "</span>";
            } else if (data.status === "Absent") {
                value = "<span style='color: red'>" + value + "</span>";
            } else if (data.status === "Half Day") {
                value = "<span style='color: orange'>" + value + "</span>";
            } else if (data.status === "Work From Home") {
                value = "<span style='color: blue'>" + value + "</span>";
            } else if (data.status === "On Leave") {
                value = "<span style='color: purple'>" + value + "</span>";
            }
        }
        
        if (column.fieldname == "coordinates" && data && data.coordinates) {
            // Make coordinates clickable to open in maps
            const coords = data.coordinates.split(', ');
            if (coords.length === 2) {
                const lat = coords[0].trim();
                const lng = coords[1].trim();
                const mapUrl = `https://www.google.com/maps?q=${lat},${lng}`;
                value = `<a href="${mapUrl}" target="_blank" title="View on Map">${data.coordinates}</a>`;
            }
        }
        
        return value;
    },
    
    onload: function(report) {
        // Add export functionality
        report.page.add_menu_item(__("Export to Excel"), function() {
            frappe.utils.csvify(report.data, report.columns, __("Employee Checkin Report"));
        });
        
        // Add summary statistics
        report.page.add_action_item(__("Show Summary"), function() {
            show_attendance_summary(report.data);
        });
    }
};

function show_attendance_summary(data) {
    if (!data || data.length === 0) {
        frappe.msgprint(__("No data to summarize"));
        return;
    }
    
    const summary = {
        total_records: data.length,
        present: 0,
        absent: 0,
        half_day: 0,
        work_from_home: 0,
        on_leave: 0,
        total_working_hours: 0,
        with_coordinates: 0
    };
    
    data.forEach(function(row) {
        if (row.status === "Present") summary.present++;
        else if (row.status === "Absent") summary.absent++;
        else if (row.status === "Half Day") summary.half_day++;
        else if (row.status === "Work From Home") summary.work_from_home++;
        else if (row.status === "On Leave") summary.on_leave++;
        
        if (row.working_hours) {
            summary.total_working_hours += row.working_hours;
        }
        
        if (row.coordinates && row.coordinates.trim()) {
            summary.with_coordinates++;
        }
    });
    
    const summary_html = `
        <div class="row">
            <div class="col-md-6">
                <h5>Attendance Summary</h5>
                <table class="table table-bordered table-condensed">
                    <tr><td>Total Records</td><td>${summary.total_records}</td></tr>
                    <tr><td style="color: green">Present</td><td>${summary.present}</td></tr>
                    <tr><td style="color: red">Absent</td><td>${summary.absent}</td></tr>
                    <tr><td style="color: orange">Half Day</td><td>${summary.half_day}</td></tr>
                    <tr><td style="color: blue">Work From Home</td><td>${summary.work_from_home}</td></tr>
                    <tr><td style="color: purple">On Leave</td><td>${summary.on_leave}</td></tr>
                </table>
            </div>
            <div class="col-md-6">
                <h5>Other Statistics</h5>
                <table class="table table-bordered table-condensed">
                    <tr><td>Total Working Hours</td><td>${summary.total_working_hours.toFixed(2)}</td></tr>
                    <tr><td>Avg Hours/Day</td><td>${(summary.total_working_hours / Math.max(summary.present + summary.half_day, 1)).toFixed(2)}</td></tr>
                    <tr><td>Records with GPS</td><td>${summary.with_coordinates}</td></tr>
                    <tr><td>GPS Coverage</td><td>${((summary.with_coordinates / summary.total_records) * 100).toFixed(1)}%</td></tr>
                </table>
            </div>
        </div>
    `;
    
    frappe.msgprint({
        title: __("Attendance Summary"),
        message: summary_html,
        wide: true
    });
}