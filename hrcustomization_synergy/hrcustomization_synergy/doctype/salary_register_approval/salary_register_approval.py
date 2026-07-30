# Copyright (c) 2026, NexTash and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import get_fullname, now_datetime


class SalaryRegisterApproval(Document):
	def validate(self):
		self.validate_duplicate()
		self.validate_order()
		self.set_approval_metadata()
		self.set_status()

	def validate_duplicate(self):
		existing = frappe.db.exists(
			"Salary Register Approval",
			{
				"company": self.company,
				"from_date": self.from_date,
				"to_date": self.to_date,
				"name": ["!=", self.name],
			},
		)
		if existing:
			frappe.throw(
				_("Salary Register Approval already exists for {0} ({1} to {2})").format(
					self.company, self.from_date, self.to_date
				)
			)

	def validate_order(self):
		if self.is_approved and not self.is_prepared:
			frappe.throw(_("Cannot mark as Approved before it is Prepared"))
		if self.is_verified and not self.is_approved:
			frappe.throw(_("Cannot mark as Verified before it is Approved"))

	def set_approval_metadata(self):
		if self.is_prepared and not self.prepared_by:
			self.prepared_by = frappe.session.user
			self.prepared_by_name = get_fullname(frappe.session.user)
			self.prepared_on = now_datetime()
		elif self.prepared_by and not self.is_prepared:
			frappe.throw(_("Prepared status cannot be undone once set"))

		if self.is_approved and not self.approved_by:
			self.approved_by = frappe.session.user
			self.approved_by_name = get_fullname(frappe.session.user)
			self.approved_on = now_datetime()
		elif self.approved_by and not self.is_approved:
			frappe.throw(_("Approved status cannot be undone once set"))

		if self.is_verified and not self.verified_by:
			self.verified_by = frappe.session.user
			self.verified_by_name = get_fullname(frappe.session.user)
			self.verified_on = now_datetime()
		elif self.verified_by and not self.is_verified:
			frappe.throw(_("Verified status cannot be undone once set"))

	def set_status(self):
		if self.is_verified:
			self.status = "Verified"
		elif self.is_approved:
			self.status = "Approved"
		elif self.is_prepared:
			self.status = "Prepared"
		else:
			self.status = "Draft"


@frappe.whitelist()
def get_or_create(company, from_date, to_date):
	name = frappe.db.exists(
		"Salary Register Approval",
		{"company": company, "from_date": from_date, "to_date": to_date},
	)

	if name:
		doc = frappe.get_doc("Salary Register Approval", name)
	else:
		doc = frappe.get_doc(
			{
				"doctype": "Salary Register Approval",
				"company": company,
				"from_date": from_date,
				"to_date": to_date,
			}
		)
		doc.insert()

	return {
		"name": doc.name,
		"status": doc.status,
		"is_prepared": doc.is_prepared,
		"prepared_by_name": doc.prepared_by_name,
		"prepared_on": doc.prepared_on,
		"is_approved": doc.is_approved,
		"approved_by_name": doc.approved_by_name,
		"approved_on": doc.approved_on,
		"is_verified": doc.is_verified,
		"verified_by_name": doc.verified_by_name,
		"verified_on": doc.verified_on,
	}