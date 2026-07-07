// For license information, please see license.txt

frappe.query_reports["WPS"] = {
	"filters": [
		{
			"fieldname": "from_date",
			"label": __("From Date"),
			"fieldtype": "Date",
			"reqd": 1,
			"default": frappe.datetime.add_months(frappe.datetime.get_today(), -1),
		},
		{
			"fieldname": "to_date",
			"label": __("To Date"),
			"fieldtype": "Date",
			"reqd": 1,
			"default": frappe.datetime.get_today()
		},
		// {
		// 	"fieldname": "bank_short_name",
		// 	"label": __("Employee Bank Short Name"),
		// 	"fieldtype": "Select",
		// 	"options": [
		// 		"",
		// 		"QNB",
		// 		"CBQ",
		// 		"BBQ",
		// 		"DBQ"
		// 	],
		// 	"default": ""
		// }

	],

	"get_datatable_options": function(options) {
		return Object.assign(options, {
			checkboxColumn: true,
		});
	},

	"get_data_for_csv": function() {
		// Override default CSV export - return false to use custom export
		return false;
	},

	"onload": function(report) {
		// Add custom WPS CSV export button
		report.page.add_inner_button(__('Download WPS CSV'), function() {
			let data = frappe.query_report.get_data() || [];

			if (!data || data.length === 0) {
				frappe.msgprint(__('No data to export'));
				return;
			}

			// Build CSV with proper formatting
			let csv_lines = [];
			let all_fields = ["sno", "qid_no", "visa_id", "employee_name", "bank_short_name",
			                  "iban", "salary_frequency", "total_working_days", "net_salary", "base_salary",
			                  "extra_hours", "extra_income", "total_deduction", "payment_type", "comments"];

			data.forEach(function(row, idx) {
				let row_values = [];

				all_fields.forEach(function(field, field_idx) {
					let value = row[field];

					// For first 2 rows, last 5 fields are empty (no quotes)
					if (idx < 2 && field_idx >= 10) {
						row_values.push('');
					} else if (value === null || value === undefined || value === '') {
						row_values.push('');
					} else if (typeof value === 'string') {
						row_values.push('"' + value.replace(/"/g, '""') + '"');
					} else {
						row_values.push(value);
					}
				});

				csv_lines.push(row_values.join(','));
			});

			// Download CSV file
			let csv_content = csv_lines.join('\n');
			let blob = new Blob([csv_content], { type: 'text/csv;charset=utf-8;' });
			let link = document.createElement('a');
			let url = URL.createObjectURL(blob);

			// Generate filename with current date
			let today = new Date();
			let filename = 'WPS_' + today.getFullYear() +
			               String(today.getMonth() + 1).padStart(2, '0') +
			               String(today.getDate()).padStart(2, '0') + '.csv';

			link.setAttribute('href', url);
			link.setAttribute('download', filename);
			link.style.visibility = 'hidden';
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);

			frappe.show_alert({
				message: __('WPS CSV file downloaded successfully'),
				indicator: 'green'
			});
		});
	}
};
