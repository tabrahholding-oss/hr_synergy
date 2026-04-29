// Copyright (c) 2025, NexTash and contributors
// For license information, please see license.txt

frappe.query_reports["Salary Summary"] = {
    "filters": [
        {
            "fieldname": "company",
            "label": __("Company"),
            "fieldtype": "Link",
            "options": "Company",
            "reqd": 1,
            "default": frappe.defaults.get_default("company"),
        },
        {
            "fieldname": "payroll_entry",
            "label": __("Payroll Entry"),
            "fieldtype": "Link",
            "options": "Payroll Entry",
            "reqd": 1,
        },
        {
            "fieldname": "start_date",
            "label": __("Start Date"),
            "fieldtype": "Date",
            "depends_on": "eval: !doc.payroll_entry", 
        },
        {
            "fieldname": "end_date",
            "label": __("End Date"),
            "fieldtype": "Date",
            "depends_on": "eval: !doc.payroll_entry", 
        }
    ]
};

