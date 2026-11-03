# Copyright (c) 2026, NexTash and Contributors
# See license.txt

import frappe
from frappe.tests.utils import FrappeTestCase


class TestMarketingCampaignRequest(FrappeTestCase):
    def test_child_table_doctypes_are_available(self):
        table_fields = {
            "channels": "Marketing Campaign Request Channel",
            "offer_items": "Marketing Campaign Request Offer Item",
            "deliverables": "Marketing Campaign Request Deliverable",
            "milestones": "Marketing Campaign Request Milestone",
            "budget_items": "Marketing Campaign Request Budget Item",
            "kpis": "Marketing Campaign Request KPI",
            "attachments": "Marketing Campaign Request Attachment",
        }
        meta = frappe.get_meta("Marketing Campaign Request")

        for fieldname, doctype in table_fields.items():
            with self.subTest(fieldname=fieldname):
                self.assertEqual(meta.get_field(fieldname).options, doctype)
                self.assertTrue(frappe.get_meta(doctype).istable)

    def test_calculates_budget_and_campaign_totals(self):
        doc = frappe.new_doc("Marketing Campaign Request")
        doc.contingency_percent = 10
        doc.expected_revenue = 100
        doc.expected_conversions = 2
        doc.avg_transaction_value = 10
        doc.actual_spend = 30
        doc.actual_revenue = 60
        doc.append("budget_items", {"qty": 2, "rate": 10})
        doc.append("channels", {"allocated_budget": 15})
        doc.append(
            "offer_items",
            {"regular_price": 100, "offer_price": 80, "expected_qty": 2},
        )
        doc.append("kpis", {"target": 20, "actual": 10})

        doc.calculate_totals()

        self.assertEqual(doc.budget_subtotal, 20)
        self.assertEqual(doc.contingency_amount, 2)
        self.assertEqual(doc.total_budget, 22)
        self.assertEqual(doc.total_channel_budget, 15)
        self.assertEqual(doc.projected_cpa, 11)
        self.assertEqual(doc.break_even_conversions, 3)
        self.assertEqual(doc.budget_variance, -8)
        self.assertEqual(doc.actual_roi, 100)
