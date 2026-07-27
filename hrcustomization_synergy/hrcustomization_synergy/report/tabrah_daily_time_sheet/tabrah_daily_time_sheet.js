// Copyright (c) 2025, Aadhil and contributors
// For license information, please see license.txt

frappe.query_reports["Tabrah Daily Time Sheet"] = {
    "filters": [
        {
            "fieldname": "from_date",
            "label": __("From Date"),
            "fieldtype": "Date",
            "reqd": 1,
            "default": frappe.datetime.month_start()
        },
        {
            "fieldname": "to_date",
            "label": __("To Date"),
            "fieldtype": "Date",
            "reqd": 1,
            "default": frappe.datetime.month_end()
        },
        {
            "fieldname": "employee",
            "label": __("Employee Code"),
            "fieldtype": "Link",
            "options": "Employee",
            "on_change": function(query_report) {
                let employee_code = frappe.query_report.get_filter_value("employee");
                if (employee_code) {
                    frappe.db.get_value("Employee", employee_code, "employee_name")
                        .then(r => {
                            if (r.message) {
                                frappe.query_report.set_filter_value("employee_name", r.message.employee_name);
                            }
                        });
                } else {
                    frappe.query_report.set_filter_value("employee_name", "");
                }
            }
        },
        {
            "fieldname": "employee_name",
            "label": __("Employee Name"),
            "fieldtype": "Data",
            "read_only": 1
        }
    ]
}
