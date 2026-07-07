// For license information, please see license.txt

frappe.ui.form.on('WPS Settings', {
	refresh: function(frm) {
		// Add helper text
		frm.set_df_property('salary_component_mappings', 'description', 
			`Configure how salary components map to WPS fields.<br>
			<b>Formula Examples:</b><br>
			• Single Component: Select "Single Component" and choose a salary component<br>
			• Multiple Components: Use formula like: [Overtime] + [Weekend OT] + [Holiday OT]<br>
			• With calculation: (base_salary * 0.1) + [Bonus]<br>
			• Remaining Balance: NET_SALARY - (base_salary + housing_allowance + food_allowance + transportation_allowance + ot_allowance)<br>
			  <i>Note: Remaining Balance values are automatically set to 0 if negative</i><br>
			<b>Available Variables:</b> NET_SALARY, TOTAL_DEDUCTION, GROSS_PAY, base_salary, housing_allowance, etc.`
		);
		
		// Add button to test formulas
		if (!frm.is_new()) {
			frm.add_custom_button(__('Test Formula'), function() {
				frappe.prompt([
					{
						fieldname: 'salary_slip',
						label: 'Select Salary Slip',
						fieldtype: 'Link',
						options: 'Salary Slip',
						reqd: 1,
						get_query: function() {
							return {
								filters: {
									docstatus: 1
								}
							};
						}
					}
				], function(values) {
					frappe.call({
						method: 'hrcustomization_synergy.hrcustomization_synergy.doctype.wps_settings.wps_settings.test_formula',
						args: {
							salary_slip: values.salary_slip
						},
						callback: function(r) {
							if (r.message) {
								let html = '<table class="table table-bordered"><thead><tr><th>Field</th><th>Value</th></tr></thead><tbody>';
								for (let [key, value] of Object.entries(r.message)) {
									html += `<tr><td>${key}</td><td>${value}</td></tr>`;
								}
								html += '</tbody></table>';
								frappe.msgprint({
									title: __('Formula Test Results'),
									message: html,
									indicator: 'green'
								});
							}
						}
					});
				}, __('Select Salary Slip to Test'), __('Test'));
			});
		}
	}
});

frappe.ui.form.on('WPS Salary Component Mapping', {
	mapping_type: function(_frm, cdt, cdn) {
		let row = locals[cdt][cdn];
		
		// Clear fields based on mapping type
		if (row.mapping_type === 'Single Component') {
			frappe.model.set_value(cdt, cdn, 'formula', '');
		} else {
			frappe.model.set_value(cdt, cdn, 'salary_component', '');
		}
		
		// Set default formulas for common fields
		if (row.mapping_type === 'Remaining Balance' && row.field_name === 'extra_income') {
			frappe.model.set_value(cdt, cdn, 'formula', 
				'NET_SALARY - (base_salary + housing_allowance + food_allowance + transportation_allowance + ot_allowance)');
		}
	},
	
	field_name: function(_frm, cdt, cdn) {
		let row = locals[cdt][cdn];
		
		// Suggest default mapping type based on field
		if (!row.mapping_type) {
			if (row.field_name === 'extra_income') {
				frappe.model.set_value(cdt, cdn, 'mapping_type', 'Remaining Balance');
			} else if (row.field_name === 'ot_allowance') {
				frappe.model.set_value(cdt, cdn, 'mapping_type', 'Formula');
			} else {
				frappe.model.set_value(cdt, cdn, 'mapping_type', 'Single Component');
			}
		}
	}
});
