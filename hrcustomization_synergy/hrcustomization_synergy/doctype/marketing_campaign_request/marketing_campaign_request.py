# Copyright (c) 2026, Tabrah Holding
# Marketing Campaign Request controller.

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cint, date_diff, flt, getdate

HOLDING_COMPANY = "Tabrah Holding"
MIN_LEAD_DAYS = 14
MAX_CONTINGENCY_PERCENT = 10
OVERRIDE_ROLES = ("Accounts Manager", "System Manager")  # may submit a PO above the request budget
# Approvals are configured separately in ERPNext Workflow; this controller holds no approval rules.

# Documents whose amounts count against the request (custom field: marketing_campaign_request)
COMMITTED_SOURCES = [("Purchase Order", "base_net_total")]
ACTUAL_SOURCES = [
	("Purchase Invoice", "base_net_total"),
	("Expense Claim", "total_sanctioned_amount"),
	("Journal Entry", "total_debit"),
]


class MarketingCampaignRequest(Document):
	# ------------------------------------------------------------------ validate
	def validate(self):
		self.validate_company_links()
		self.validate_dates()
		self.calculate_totals()
		self.validate_channels()
		self.validate_offer()
		self.validate_privacy()
		self.set_budget_remaining()
		self.set_draft_status()

	def validate_company_links(self):
		def belongs(doctype, name, allow_holding=False):
			if not name:
				return True
			company = frappe.db.get_value(doctype, name, "company")
			return company == self.company or (allow_holding and company == HOLDING_COMPANY)

		if not belongs("Cost Center", self.cost_center):
			frappe.throw(_("Cost Center {0} does not belong to {1}").format(self.cost_center, self.company))
		if not belongs("Account", self.expense_account):
			frappe.throw(_("Expense Account {0} does not belong to {1}").format(self.expense_account, self.company))
		if self.branch and frappe.get_meta("Branch").has_field("company") and not belongs("Branch", self.branch):
			frappe.throw(_("Branch {0} does not belong to {1}").format(self.branch, self.company))
		# Holding Marketing raises requests on behalf of subsidiaries
		if not belongs("Department", self.department, allow_holding=True):
			frappe.throw(_("Department {0} must belong to {1} or {2}").format(self.department, self.company, HOLDING_COMPANY))
		if frappe.db.get_value("Cost Center", self.cost_center, "is_group"):
			frappe.throw(_("Select a non-group Cost Center"))

	def validate_dates(self):
		start, end = getdate(self.start_date), getdate(self.end_date)
		if end < start:
			frappe.throw(_("Campaign End Date cannot be before Start Date"))
		if self.creative_deadline and getdate(self.creative_deadline) > start:
			frappe.throw(_("Creative Deadline must be on or before the Campaign Start Date"))
		self.duration_days = date_diff(end, start) + 1

		if self.docstatus == 0 and date_diff(start, getdate(self.request_date)) < MIN_LEAD_DAYS:
			if self.priority != "Urgent" or not (self.urgency_justification or "").strip():
				frappe.throw(_("Start Date is less than {0} days after the request. Set Priority to Urgent and give an Urgency Justification.").format(MIN_LEAD_DAYS))

		for row in self.channels:
			for val in (row.start_date, row.end_date):
				if val and not (start <= getdate(val) <= end):
					frappe.throw(_("Channel row {0}: dates must fall within the campaign dates").format(row.idx))

	def calculate_totals(self):
		for row in self.channels:
			row.currency = self.currency
		for row in self.budget_items:
			row.currency = self.currency
			row.amount = flt(row.qty) * flt(row.rate)
		for row in self.offer_items:
			row.currency = self.currency
			row.discount_percent = (flt(row.regular_price) - flt(row.offer_price)) / flt(row.regular_price) * 100 if flt(row.regular_price) else 0
			row.expected_revenue = flt(row.offer_price) * flt(row.expected_qty)
		for row in self.kpis:
			row.achievement = flt(row.actual) / flt(row.target) * 100 if flt(row.target) and row.actual is not None else 0

		if flt(self.contingency_percent) > MAX_CONTINGENCY_PERCENT:
			frappe.throw(_("Contingency cannot exceed {0}%").format(MAX_CONTINGENCY_PERCENT))

		self.budget_subtotal = sum(flt(r.amount) for r in self.budget_items)
		self.contingency_amount = self.budget_subtotal * flt(self.contingency_percent) / 100
		self.total_budget = self.budget_subtotal + self.contingency_amount
		self.total_channel_budget = sum(flt(r.allocated_budget) for r in self.channels)

		total = flt(self.total_budget)
		self.projected_roi = (flt(self.expected_revenue) - total) / total * 100 if total else 0
		self.projected_cpa = total / cint(self.expected_conversions) if cint(self.expected_conversions) else 0
		self.break_even_conversions = cint(-(-total // flt(self.avg_transaction_value))) if flt(self.avg_transaction_value) else 0
		self.calculate_actuals()

	def before_update_after_submit(self):
		for row in self.kpis:
			row.achievement = flt(row.actual) / flt(row.target) * 100 if flt(row.target) and row.actual is not None else 0
		self.calculate_actuals()

	def calculate_actuals(self):
		self.budget_variance = flt(self.total_budget) - flt(self.actual_spend)
		spend = flt(self.actual_spend)
		self.actual_roi = (flt(self.actual_revenue) - spend) / spend * 100 if spend and self.actual_revenue else 0

	def validate_channels(self):
		if flt(self.total_channel_budget) > flt(self.total_budget):
			frappe.throw(_("Channel allocations ({0}) exceed the Total Budget ({1})").format(
				frappe.format(self.total_channel_budget, {"fieldtype": "Currency"}),
				frappe.format(self.total_budget, {"fieldtype": "Currency"})))

	def validate_offer(self):
		if not self.has_offer:
			return
		if not self.offer_type or not self.offer_items or not (self.offer_terms or "").strip():
			frappe.throw(_("Offer Type, at least one Offer Item and Terms & Conditions are required when the campaign includes an offer"))
		for row in self.offer_items:
			if flt(row.offer_price) >= flt(row.regular_price) and self.offer_type not in ("Free Item or Gift", "Loyalty Points", "Competition or Giveaway"):
				frappe.throw(_("Offer Item row {0}: Offer Price must be lower than Regular Price").format(row.idx))

	def validate_privacy(self):
		if self.uses_customer_data and not self.consent_confirmed:
			frappe.throw(_("Confirm customer consent for direct marketing (Law No. 13 of 2016) before using customer personal data"))

	def set_budget_remaining(self):
		"""Informational: remaining annual budget for cost center + account, if an ERPNext Budget exists."""
		fy = frappe.db.get_value("Fiscal Year", {"year_start_date": ("<=", self.start_date), "year_end_date": (">=", self.start_date), "disabled": 0}, ["name", "year_start_date", "year_end_date"], as_dict=True)
		if not fy:
			return
		budget = frappe.db.get_value("Budget", {"cost_center": self.cost_center, "fiscal_year": fy.name, "docstatus": 1, "company": self.company}, "name")
		if not budget:
			self.budget_remaining = 0
			return
		allocated = flt(frappe.db.get_value("Budget Account", {"parent": budget, "account": self.expense_account}, "budget_amount"))
		spent = flt(frappe.db.sql("""select sum(debit - credit) from `tabGL Entry`
			where account=%s and cost_center=%s and is_cancelled=0 and posting_date between %s and %s""",
			(self.expense_account, self.cost_center, fy.year_start_date, fy.year_end_date))[0][0])
		self.budget_remaining = allocated - spent
		if allocated and flt(self.total_budget) > self.budget_remaining:
			frappe.msgprint(_("Total Budget exceeds the remaining {0} budget for {1}").format(self.expense_account, self.cost_center), indicator="orange", alert=True)

	def set_draft_status(self):
		if self.docstatus == 0:
			self.status = "Draft"

	# ------------------------------------------------------------------ submit
	def before_submit(self):
		if not self.brand_guidelines_confirmed:
			frappe.throw(_("Confirm the campaign follows the brand guidelines"))
		for table, label in (("channels", "channel"), ("budget_items", "budget line"), ("kpis", "KPI"), ("deliverables", "deliverable")):
			if not self.get(table):
				frappe.throw(_("Add at least one {0}").format(label))
		self.status = "Approved"
		self.calculate_actuals()

	def on_submit(self):
		self.create_crm_campaign()
		self.create_pricing_rules()

	def create_crm_campaign(self):
		if self.campaign:
			return
		camp = frappe.new_doc("Campaign")
		camp.campaign_name = self.name
		camp.description = "{0} ({1})".format(self.campaign_title, self.company)
		camp.insert(ignore_permissions=True)
		self.db_set({"campaign": camp.name, "utm_campaign": self.name})

	def create_pricing_rules(self):
		if not self.has_offer:
			return
		for row in self.offer_items:
			if row.pricing_rule or flt(row.offer_price) <= 0:
				continue
			pr = frappe.new_doc("Pricing Rule")
			pr.title = "{0} - {1}".format(self.name, row.item_code)[:140]
			pr.apply_on = "Item Code"
			pr.append("items", {"item_code": row.item_code})
			pr.selling = 1
			pr.company = self.company
			pr.currency = self.currency
			pr.valid_from = self.start_date
			pr.valid_upto = self.offer_valid_until or self.end_date
			pr.rate_or_discount = "Rate"
			pr.rate = row.offer_price
			pr.coupon_code_based = 0
			pr.disable = 1  # Marketing enables it at launch
			pr.insert(ignore_permissions=True)
			row.db_set("pricing_rule", pr.name)

	# ------------------------------------------------------------------ cancel
	def before_cancel(self):
		linked = []
		for doctype, _field in COMMITTED_SOURCES + ACTUAL_SOURCES:
			if frappe.get_meta(doctype).has_field("marketing_campaign_request"):
				linked += [(doctype, n) for n in frappe.get_all(doctype, {"marketing_campaign_request": self.name, "docstatus": 1}, pluck="name")]
		if linked:
			frappe.throw(_("Cannot cancel: submitted documents are linked to this request: {0}").format(
				", ".join("{0} {1}".format(d, n) for d, n in linked[:10])))

	def on_cancel(self):
		self.ignore_linked_doctypes = ("Campaign", "Pricing Rule")
		for row in self.offer_items:
			if row.pricing_rule:
				frappe.db.set_value("Pricing Rule", row.pricing_rule, "disable", 1)
		self.db_set("status", "Cancelled")


# ---------------------------------------------------------------------- API
@frappe.whitelist()
def get_company_defaults(company):
	"""Main cost center and marketing expense account for a company."""
	abbr = frappe.db.get_value("Company", company, "abbr")
	cost_center = frappe.db.get_value("Cost Center", {"company": company, "is_group": 0, "cost_center_name": "Main"}, "name") \
		or frappe.db.get_value("Company", company, "cost_center")
	account = None
	for pattern in ("%Advertising and Marketing%", "%Marketing Expenses%", "%Marketing%"):
		account = frappe.db.get_value("Account", {
			"company": company, "root_type": "Expense", "is_group": 0, "disabled": 0,
			"account_name": ("like", pattern), "name": ("not like", "%COGS%")}, "name")
		if account:
			break
	return {"cost_center": cost_center, "expense_account": account, "abbr": abbr}


@frappe.whitelist()
def set_campaign_status(name, status):
	doc = frappe.get_doc("Marketing Campaign Request", name)
	doc.check_permission("write")
	if not {"Marketing Manager", "System Manager"} & set(frappe.get_roles()):
		frappe.throw(_("Only a Marketing Manager can change the campaign status"))
	allowed = {
		"Approved": ("In Progress", "On Hold"),
		"In Progress": ("On Hold", "Completed"),
		"On Hold": ("In Progress", "Completed"),
	}
	if doc.docstatus != 1 or status not in allowed.get(doc.status, ()):
		frappe.throw(_("Cannot move from {0} to {1}").format(doc.status, status))
	if status == "In Progress":
		if doc.moci_permit_required and not doc.moci_permit_no:
			frappe.throw(_("Enter the MoCI Permit No. before starting the campaign"))
		if not doc.actual_start_date:
			doc.actual_start_date = frappe.utils.today()
	if status == "Completed":
		if not doc.actual_end_date or not doc.post_campaign_report:
			frappe.throw(_("Enter the Actual End Date and attach the Post-Campaign Report"))
		if any(r.actual is None for r in doc.kpis):
			frappe.throw(_("Enter KPI actuals before completing the campaign"))
	doc.status = status
	doc.save()
	return doc.status


@frappe.whitelist()
def make_material_request(source_name):
	"""Material Request (Purchase) for budget lines routed through procurement. Normal quotation and approval rules apply."""
	src = frappe.get_doc("Marketing Campaign Request", source_name)
	src.check_permission("read")
	if src.docstatus != 1:
		frappe.throw(_("The request must be approved first"))
	rows = [r for r in src.budget_items if r.procurement_route == "Purchase Request / PO" and r.item_code and not r.material_request]
	if not rows:
		frappe.throw(_("No budget lines with an Item and route Purchase Request / PO are waiting to be raised"))
	mr = frappe.new_doc("Material Request")
	mr.material_request_type = "Purchase"
	mr.company = src.company
	mr.transaction_date = frappe.utils.today()
	mr.schedule_date = min(getdate(r.required_by or src.start_date) for r in rows)
	if mr.meta.has_field("marketing_campaign_request"):
		mr.marketing_campaign_request = src.name
	for r in rows:
		mr.append("items", {
			"item_code": r.item_code, "qty": r.qty, "rate": r.rate, "description": r.description,
			"schedule_date": r.required_by or src.start_date, "cost_center": src.cost_center,
			"expense_account": src.expense_account, "project": src.project,
		})
	return mr.as_dict()


def update_spend(name):
	if not name or not frappe.db.exists("Marketing Campaign Request", name):
		return
	def total(sources):
		amount = 0
		for doctype, field in sources:
			if frappe.get_meta(doctype).has_field("marketing_campaign_request"):
				amount += flt(frappe.db.get_value(doctype, {"marketing_campaign_request": name, "docstatus": 1}, "sum({0})".format(field)))
		return amount
	committed, actual = total(COMMITTED_SOURCES), total(ACTUAL_SOURCES)
	budget = flt(frappe.db.get_value("Marketing Campaign Request", name, "total_budget"))
	frappe.db.set_value("Marketing Campaign Request", name, {
		"committed_spend": committed, "actual_spend": actual, "budget_variance": budget - actual,
	}, update_modified=False)


def on_linked_doc_change(doc, method=None):
	"""hooks.py doc_events for PO / PI / Expense Claim / Journal Entry: on_submit, on_cancel."""
	update_spend(doc.get("marketing_campaign_request"))


def check_po_against_budget(doc, method=None):
	"""hooks.py doc_events Purchase Order: before_submit."""
	name = doc.get("marketing_campaign_request")
	if not name:
		return
	mcr = frappe.db.get_value("Marketing Campaign Request", name, ["docstatus", "total_budget", "company"], as_dict=True)
	if not mcr or mcr.docstatus != 1:
		frappe.throw(_("Marketing Campaign Request {0} is not approved").format(name))
	if mcr.company != doc.company:
		frappe.throw(_("Marketing Campaign Request {0} belongs to {1}").format(name, mcr.company))
	committed = flt(frappe.db.get_value("Purchase Order", {"marketing_campaign_request": name, "docstatus": 1, "name": ("!=", doc.name)}, "sum(base_net_total)"))
	if committed + flt(doc.base_net_total) > flt(mcr.total_budget) and not set(OVERRIDE_ROLES) & set(frappe.get_roles()):
		frappe.throw(_("This Purchase Order takes committed spend above the budget of {0}. An Accounts Manager must submit it.").format(name))


def daily_update_spend():
	"""hooks.py scheduler_events daily."""
	for name in frappe.get_all("Marketing Campaign Request", {"docstatus": 1, "status": ("not in", ("Completed", "Cancelled"))}, pluck="name"):
		update_spend(name)
