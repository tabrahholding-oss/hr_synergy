// Copyright (c) 2026, NexTash and contributors
// For license information, please see license.txt

function refresh_salary_register_approval_cache() {
	var company = frappe.query_report.get_filter_value("company");
	var from_date = frappe.query_report.get_filter_value("from_date");
	var to_date = frappe.query_report.get_filter_value("to_date");

	window.__salary_register_approval = null;

	if (!company || !from_date || !to_date) {
		return;
	}

	frappe.call({
		method: "frappe.client.get_list",
		args: {
			doctype: "Salary Register Approval",
			filters: { company: company, from_date: from_date, to_date: to_date },
			fields: [
				"name", "status",
				"is_prepared", "prepared_by_name", "prepared_on",
				"is_approved", "approved_by_name", "approved_on",
				"is_verified", "verified_by_name", "verified_on",
			],
			limit_page_length: 1,
		},
	}).then(function (r) {
		if (r.message && r.message.length) {
			window.__salary_register_approval = r.message[0];
		}
	});
}

function mark_salary_register_stage(fieldname) {
	var company = frappe.query_report.get_filter_value("company");
	var from_date = frappe.query_report.get_filter_value("from_date");
	var to_date = frappe.query_report.get_filter_value("to_date");

	if (!company || !from_date || !to_date) {
		frappe.msgprint(__("Please select Company, From Date and To Date first"));
		return;
	}

	frappe.call({
		method: "hrcustomization_synergy.hrcustomization_synergy.doctype.salary_register_approval.salary_register_approval.get_or_create",
		args: { company: company, from_date: from_date, to_date: to_date },
	}).then(function (r) {
		if (!r.message) return;
		frappe.call({
			method: "frappe.client.set_value",
			args: {
				doctype: "Salary Register Approval",
				name: r.message.name,
				fieldname: fieldname,
				value: 1,
			},
		}).then(function () {
			frappe.show_alert({ message: __("Updated"), indicator: "green" });
			refresh_salary_register_approval_cache();
		});
	});
}

frappe.query_reports["Salary Register Report"] = {
	filters: [
		{
			fieldname: "from_date",
			label: __("From"),
			fieldtype: "Date",
			default: frappe.datetime.add_months(frappe.datetime.get_today(), -1),
			reqd: 1,
			width: "100px",
			on_change: function () {
				refresh_salary_register_approval_cache();
			},
		},
		{
			fieldname: "to_date",
			label: __("To"),
			fieldtype: "Date",
			default: frappe.datetime.get_today(),
			reqd: 1,
			width: "100px",
			on_change: function () {
				refresh_salary_register_approval_cache();
			},
		},
		{
			fieldname: "currency",
			fieldtype: "Link",
			options: "Currency",
			label: __("Currency"),
			default: erpnext.get_currency(frappe.defaults.get_default("Company")),
			width: "50px",
		},
		{
			fieldname: "employee",
			label: __("Employee"),
			fieldtype: "Link",
			options: "Employee",
			width: "100px",
		},
		{
			fieldname: "company",
			label: __("Company"),
			fieldtype: "Link",
			options: "Company",
			on_change: function(query_report) {
				var company = frappe.query_report.get_filter_value("company");
				if (company) {
					frappe.db.get_value("Company", company, "default_letter_head").then(function(r) {
						window.__report_company_letter_head = window.__report_company_letter_head || {};
						if (r.message && r.message.default_letter_head) {
							window.__report_company_letter_head[company] = r.message.default_letter_head;
						}
					});
				}
				refresh_salary_register_approval_cache();
			}
		},
		{
			fieldname: "docstatus",
			label: __("Document Status"),
			fieldtype: "Select",
			options: ["Draft", "Submitted", "Cancelled"],
			default: "Submitted",
			width: "100px",
		},
		{
			fieldname: "department",
			label: __("Department"),
			fieldtype: "Link",
			options: "Department",
			width: "100px",
			get_query: function () {
				return {
					filters: {
						company: frappe.query_report.get_filter_value("company"),
					},
				};
			},
		},
		{
			fieldname: "designation",
			label: __("Designation"),
			fieldtype: "Link",
			options: "Designation",
			width: "100px",
		},
		{
			fieldname: "branch",
			label: __("Branch"),
			fieldtype: "Link",
			options: "Branch",
			width: "100px",
		},
	],
	onload: function (report) {
		report.page.add_inner_button(__("Mark as Prepared"), function () {
			mark_salary_register_stage("is_prepared");
		}, __("Approval"));

		report.page.add_inner_button(__("Mark as Approved"), function () {
			mark_salary_register_stage("is_approved");
		}, __("Approval"));

		report.page.add_inner_button(__("Mark as Verified"), function () {
			mark_salary_register_stage("is_verified");
		}, __("Approval"));

		refresh_salary_register_approval_cache();

		if (!frappe.query_report.__salary_register_print_patched) {
			var original_print_report = frappe.query_report.print_report.bind(frappe.query_report);

			frappe.query_report.print_report = function (print_settings) {
				if (frappe.query_report.report_name === "Salary Register Report") {
					var approval = window.__salary_register_approval;

					var next_step = null;
					if (!approval || !approval.is_prepared) {
						next_step = __("Prepared");
					} else if (!approval.is_approved) {
						next_step = __("Approved");
					} else if (!approval.is_verified) {
						next_step = __("Verified");
					}

					if (next_step) {
						frappe.msgprint({
							title: __("Cannot Print"),
							message: __("This Salary Register cannot be printed yet. It still needs to be marked as {0}.", [next_step]),
							indicator: "red",
						});
						return;
					}
				}
				return original_print_report(print_settings);
			};

			frappe.query_report.__salary_register_print_patched = true;
		}
	},
};