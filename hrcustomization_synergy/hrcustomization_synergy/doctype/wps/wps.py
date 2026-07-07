# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.desk.query_report import build_xlsx_data
from frappe.utils.csvutils import to_csv
from frappe import _
from datetime import datetime


class WPS(Document):
	def validate(self):
		pass

	def on_submit(self):
		if not self.employees:
			frappe.throw(_("No employees remaining for WPS"))

	def get_data_from_slip(self):

		filters = self.get_filters()
		employees = self.get_employees()

		if employees:
			filters['employee'] = ["not in", employees]

		data = frappe.db.get_all("Salary Slip", filters=filters, fields=[
			"name as salary_slip", "employee", "net_pay as amount"
		])

		self.set("employees", [])
		for row in data:
			self.append("employees", row)

	def get_filters(self):
		filters = {
			"docstatus": 1
		}

		if self.from_date:
			filters['start_date'] = [">=", self.from_date]

		if self.to_date:
			filters['end_date'] = ["<=", self.to_date]

		if self.department:
			filters['department'] = self.department

		return filters

	@frappe.whitelist()
	def get_filtered_employees(self):
		employee_filters = {}

		if self.sponsor:
			employee_filters['custom_sponsor'] = self.sponsor

		if self.salary_mode:
			employee_filters['salary_mode'] = self.salary_mode

		employees = frappe.db.get_all("Employee", filters=employee_filters, fields=["name as employee"])

		if not employees:
			frappe.msgprint(_("No employees found matching the selected filters"))
			return

		employee_list = [emp.employee for emp in employees]

		filters = self.get_filters()

		already_added_employees = self.get_employees()
		if already_added_employees:
			# Exclude employees that are already added to other WPS records
			employee_list = list(set(employee_list) - set(already_added_employees))

		if not employee_list:
			frappe.msgprint(_("No employees remaining after filtering"))
			return

		filters['employee'] = ["in", employee_list]

		data = frappe.db.get_all("Salary Slip", filters=filters, fields=[
			"name as salary_slip", "employee", "net_pay as amount"
		])

		self.set("employees", [])
		for row in data:
			self.append("employees", row)
	
	def get_employees(self):
		wps = frappe.qb.DocType("WPS")
		wps_emp = frappe.qb.DocType("WPS Employee")

		query = (
			frappe.qb.from_(wps)
			.inner_join(wps_emp)
			.on(wps_emp.parent == wps.name)
			.select(
				wps_emp.employee.as_('employee'),
			)
			.where(wps.docstatus == 1)
			.where(wps.name != self.name)
			.where(wps.docstatus == 1)
			.where(wps.name != self.name)
			.where(wps.from_date >= self.from_date)
			.where(wps.to_date <= self.to_date)
		)

		return query.run(pluck=True)

	def get_report_content(self):
		filters = self.get_report_filters()
		employees = [d.employee for d in self.employees]
		filters['employees'] = employees
		report = frappe.get_doc("Report", "WPS")
		filters = frappe.parse_json(filters) if filters else {}

		columns, data = report.get_data(
			user=frappe.session.user,
			filters=filters,
			as_dict=True,
			ignore_prepared_report=True,
		)

		# Get employer_eid and bank from linked Sponsor doctype
		if self.sponsor:
			sponsor_doc = frappe.get_doc("Sponsor", self.sponsor)
			employer_id = sponsor_doc.employer_eid or ""
			bank = sponsor_doc.payer_bank_short_name or ""
		else:
			employer_id = ""
			bank = ""

		today = datetime.today()
		now = datetime.now()
		creation_date = today.strftime("%Y%m%d")
		creation_time = now.strftime("%H%M")
		filename = f"SIF_{employer_id}_{bank}_{creation_date}_{creation_time}"

		# Generate custom WPS CSV format
		csv_content = self.generate_wps_csv(data)
		return csv_content, filename

	def generate_wps_csv(self, data):
		"""Generate WPS CSV with proper format - first 3 rows have special formatting"""
		from io import StringIO

		output = StringIO()

		# All fields in order
		all_fields = ["sno", "qid_no", "visa_id", "employee_name", "bank_short_name",
		              "iban", "salary_frequency", "total_working_days", "net_salary", "base_salary",
		              "extra_hours", "extra_income", "total_deduction", "payment_type", "comments"]

		# First row: Column headers for the first 10 fields only
		header_labels = [
			"Employer EID", "File Creation Date", "File Creation Time", "Payer EID", "Payer QID",
			"Payer Bank Short Name", "Payer IBAN", "Salary Year and Month", "Total Salaries", "Total Records"
		]
		# Add 5 empty columns for header row
		header_row = [f'"{label}"' for label in header_labels] + ["", "", "", "", ""]
		output.write(",".join(header_row) + "\n")

		# Process remaining rows from data
		for idx, row in enumerate(data):
			row_values = []

			for field_idx, field in enumerate(all_fields):
				value = row.get(field, "")

				# For first data row only (idx 0 = second CSV row), last 5 fields are empty
				# For second data row (idx 1 = third CSV row = title headers), show all 15 field labels
				if idx == 0 and field_idx >= 10:
					# First data row - empty last 5 columns
					row_values.append("")
				elif idx == 1:
					# Second data row - this is the title headers row, show the label
					# The labels are already in the row data from the report
					if value is None or value == "":
						row_values.append("")
					elif isinstance(value, str):
						row_values.append(f'"{value.replace(chr(34), chr(34)+chr(34))}"')
					else:
						row_values.append(str(value))
				else:
					# All other rows - show actual data
					if value is None or value == "":
						row_values.append("")
					elif isinstance(value, str):
						row_values.append(f'"{value.replace(chr(34), chr(34)+chr(34))}"')
					else:
						row_values.append(str(value))

			output.write(",".join(row_values) + "\n")

		return output.getvalue()
	
	def get_report_filters(self):
		filters = {
			"docstatus": 1
		}

		if self.from_date:
			filters['from_date'] = self.from_date

		if self.to_date:
			filters['to_date'] = self.to_date

		if self.department:
			filters['department'] = self.department

		if self.sponsor:
			filters['sponsor'] = self.sponsor

		return filters

@frappe.whitelist()
def get_wps_csv(docname):
	doc = frappe.get_doc("WPS", docname)
	data, filename = doc.get_report_content()
	if not data:
		frappe.msgprint(_("No Data"))
		return

	frappe.response["filecontent"] = data
	frappe.response["type"] = "download" 
	frappe.response["doctype"] = "WPS"
	frappe.response["filename"] = f"{filename}.csv"