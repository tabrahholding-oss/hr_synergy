# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe import _


class WPSSettings(Document):
	pass


@frappe.whitelist()
def test_formula(salary_slip):
	"""Test WPS formula calculations for a given salary slip"""
	from hrcustomization_synergy.hrcustomization_synergy.wps_utils import calculate_salary_breakdowns
	
	# Get salary slip data
	slip_data = frappe.db.get_value(
		"Salary Slip",
		salary_slip,
		["name", "net_pay as net_salary", "total_deduction", "gross_pay"],
		as_dict=True
	)
	
	if not slip_data:
		frappe.throw(_("Salary Slip not found"))
	
	# Calculate breakdowns
	result = calculate_salary_breakdowns(slip_data)
	
	# Add totals for verification
	result["_total_mapped"] = sum([
		result.get("base_salary", 0),
		result.get("housing_allowance", 0),
		result.get("food_allowance", 0),
		result.get("transportation_allowance", 0),
		result.get("ot_allowance", 0),
		result.get("extra_income", 0)
	])
	
	result["_net_salary"] = slip_data.get("net_salary", 0)
	result["_difference"] = result["_net_salary"] - result["_total_mapped"]
	
	return result
