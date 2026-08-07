// Copyright (c) 2026, NexTash and contributors
// For license information, please see license.txt

frappe.query_reports["NH Invoice by Time Details"] = {
"filters": [
	{
		"fieldname": "from_date",
		"label": __("From Date"),
		"fieldtype": "Date",
		"default": frappe.datetime.month_start(),
		"reqd": 1
	},
	{
		"fieldname": "to_date",
		"label": __("To Date"),
		"fieldtype": "Date",
		"default": frappe.datetime.month_end(),
		"reqd": 1
	},
	{
		"fieldname": "customer",
		"label": __("Customer"),
		"fieldtype": "Link",
		"options": "Customer"
	},
	{
		"fieldname": "company",
		"label": __("Company"),
		"fieldtype": "Link",
		"options": "Company",
	},
	]
};
