import frappe
from frappe import _


@frappe.whitelist()
def get_material_transfer_purchase_balance():
    # =========================================================
    # GET MATERIAL TRANSFER BALANCES AVAILABLE FOR PURCHASE
    # =========================================================

    results = []

    # ---------------------------------------------------------
    # Find submitted Material Requests marked as available
    # ---------------------------------------------------------

    material_requests = frappe.get_all(
        "Material Request",
        filters={
            "docstatus": 1,
            "material_request_type": "Material Transfer",
            "custom_available_for_purchase": 1
        },
        fields=[
            "name",
            "company"
        ],
        order_by="creation desc"
    )

    # ---------------------------------------------------------
    # Process Material Requests
    # ---------------------------------------------------------

    for mr in material_requests:

        mr_items = frappe.get_all(
            "Material Request Item",
            filters={
                "parent": mr.name,
                "docstatus": 1
            },
            fields=[
                "name",
                "item_code",
                "item_name",
                "description",
                "qty",
                "stock_qty",
                "uom",
                "stock_uom",
                "conversion_factor",
                "warehouse",
                "cost_center",
                "project"
            ]
        )

        for mr_item in mr_items:

            # -------------------------------------------------
            # Requested quantity
            # -------------------------------------------------

            requested_qty = frappe.utils.flt(mr_item.stock_qty)

            # -------------------------------------------------
            # Material Transfer quantity
            # -------------------------------------------------

            transferred = frappe.db.sql(
                """
                SELECT COALESCE(SUM(sed.transfer_qty), 0)
                FROM `tabStock Entry Detail` sed
                INNER JOIN `tabStock Entry` se
                    ON se.name = sed.parent
                WHERE
                    se.docstatus = 1
                    AND se.purpose = 'Material Transfer'
                    AND sed.material_request = %s
                    AND sed.material_request_item = %s
                """,
                (mr.name, mr_item.name)
            )

            transferred_qty = 0
            if transferred:
                transferred_qty = frappe.utils.flt(transferred[0][0])

            # -------------------------------------------------
            # Purchase Order quantity
            # -------------------------------------------------

            ordered = frappe.db.sql(
                """
                SELECT COALESCE(SUM(poi.stock_qty), 0)
                FROM `tabPurchase Order Item` poi
                INNER JOIN `tabPurchase Order` po
                    ON po.name = poi.parent
                WHERE
                    po.docstatus < 2
                    AND poi.material_request = %s
                    AND poi.material_request_item = %s
                """,
                (mr.name, mr_item.name)
            )

            ordered_qty = 0
            if ordered:
                ordered_qty = frappe.utils.flt(ordered[0][0])

            # -------------------------------------------------
            # Calculate balance
            # -------------------------------------------------

            balance_qty = requested_qty - transferred_qty - ordered_qty

            # -------------------------------------------------
            # Only show items with balance
            # -------------------------------------------------

            if balance_qty <= 0:
                continue

            # -------------------------------------------------
            # Conversion Factor
            # -------------------------------------------------

            conversion_factor = frappe.utils.flt(mr_item.conversion_factor)
            if conversion_factor <= 0:
                conversion_factor = 1

            # -------------------------------------------------
            # Purchase quantity
            # -------------------------------------------------

            purchase_qty = balance_qty / conversion_factor

            # -------------------------------------------------
            # Add to result
            # -------------------------------------------------

            results.append({
                "material_request": mr.name,
                "material_request_item": mr_item.name,
                "company": mr.company,
                "item_code": mr_item.item_code,
                "item_name": mr_item.item_name,
                "description": mr_item.description,
                "requested_qty": requested_qty,
                "transferred_qty": transferred_qty,
                "ordered_qty": ordered_qty,
                "balance_qty": balance_qty,
                "qty": purchase_qty,
                "uom": mr_item.uom,
                "stock_uom": mr_item.stock_uom,
                "conversion_factor": conversion_factor,
                "warehouse": mr_item.warehouse,
                "cost_center": mr_item.cost_center,
                "project": mr_item.project
            })

    return results


@frappe.whitelist()
def get_material_transfer_purchase_items(material_request=None, material_request_item=None):
    # Get direct parameters
    mr_name = material_request
    mr_item_name = material_request_item

    if not mr_name:
        frappe.throw(_("Material Request is missing."))
    if not mr_item_name:
        frappe.throw(_("Material Request Item is missing."))

    # Get Material Request Item
    mr_item = frappe.db.get_value(
        "Material Request Item",
        mr_item_name,
        [
            "item_code",
            "item_name",
            "description",
            "qty",
            "stock_qty",
            "uom",
            "stock_uom",
            "conversion_factor",
            "warehouse",
            "cost_center",
            "project"
        ],
        as_dict=True
    )

    if not mr_item:
        frappe.throw(_("Material Request Item not found: {0}").format(mr_item_name))

    # Requested quantity
    requested_qty = frappe.utils.flt(mr_item.stock_qty)

    # ---------------------------------------------------------
    # Get transferred quantity
    # ---------------------------------------------------------
    transferred = frappe.db.sql(
        """
        SELECT COALESCE(SUM(sed.transfer_qty), 0)
        FROM `tabStock Entry Detail` sed
        INNER JOIN `tabStock Entry` se
            ON se.name = sed.parent
        WHERE
            se.docstatus = 1
            AND se.purpose = 'Material Transfer'
            AND sed.material_request = %s
            AND sed.material_request_item = %s
        """,
        (mr_name, mr_item_name)
    )

    transferred_qty = 0
    if transferred:
        transferred_qty = frappe.utils.flt(transferred[0][0])

    # ---------------------------------------------------------
    # Get quantity already added to Purchase Orders
    # ---------------------------------------------------------
    ordered = frappe.db.sql(
        """
        SELECT COALESCE(SUM(poi.stock_qty), 0)
        FROM `tabPurchase Order Item` poi
        INNER JOIN `tabPurchase Order` po
            ON po.name = poi.parent
        WHERE
            po.docstatus < 2
            AND poi.material_request = %s
            AND poi.material_request_item = %s
        """,
        (mr_name, mr_item_name)
    )

    ordered_qty = 0
    if ordered:
        ordered_qty = frappe.utils.flt(ordered[0][0])

    # ---------------------------------------------------------
    # Calculate remaining quantity
    # ---------------------------------------------------------
    balance_qty = requested_qty - transferred_qty - ordered_qty

    if balance_qty <= 0:
        frappe.throw(_("No remaining quantity is available for {0}").format(mr_item.item_code))

    # ---------------------------------------------------------
    # Conversion Factor
    # ---------------------------------------------------------
    conversion_factor = frappe.utils.flt(mr_item.conversion_factor)
    if conversion_factor <= 0:
        conversion_factor = 1

    # ---------------------------------------------------------
    # Purchase Order quantity
    # ---------------------------------------------------------
    purchase_qty = balance_qty / conversion_factor

    # ---------------------------------------------------------
    # Return result
    # ---------------------------------------------------------
    return [
        {
            "item_code": mr_item.item_code,
            "item_name": mr_item.item_name,
            "description": mr_item.description,
            "qty": purchase_qty,
            "uom": mr_item.uom,
            "stock_uom": mr_item.stock_uom,
            "conversion_factor": conversion_factor,
            "warehouse": mr_item.warehouse,
            "cost_center": mr_item.cost_center,
            "project": mr_item.project,
            "material_request": mr_name,
            "material_request_item": mr_item_name
        }
    ]


@frappe.whitelist()
def make_material_transfer_balance_available(material_request=None):
    # ---------------------------------------------------------
    # Make Material Transfer Balance Available for Purchase
    # ---------------------------------------------------------
    mr_name = material_request
    if not mr_name:
        frappe.throw(_("Material Request is required."))

    # ---------------------------------------------------------
    # Get Material Request
    # ---------------------------------------------------------
    mr = frappe.get_doc("Material Request", mr_name)

    if mr.docstatus != 1:
        frappe.throw(_("Material Request must be submitted."))

    if mr.material_request_type != "Material Transfer":
        frappe.throw(_("This function is only available for Material Transfer Material Requests."))

    # ---------------------------------------------------------
    # Check current balance
    # ---------------------------------------------------------
    total_balance = 0

    for mr_item in mr.items:
        requested_qty = frappe.utils.flt(mr_item.stock_qty)
        if requested_qty <= 0:
            continue

        # -----------------------------------------------------
        # Quantity transferred through Stock Entry
        # -----------------------------------------------------
        transferred = frappe.db.sql(
            """
            SELECT COALESCE(SUM(sed.transfer_qty), 0)
            FROM `tabStock Entry Detail` sed
            INNER JOIN `tabStock Entry` se
                ON se.name = sed.parent
            WHERE
                se.docstatus = 1
                AND se.purpose = 'Material Transfer'
                AND sed.material_request = %s
                AND sed.material_request_item = %s
            """,
            (mr.name, mr_item.name)
        )

        transferred_qty = 0
        if transferred:
            transferred_qty = frappe.utils.flt(transferred[0][0])

        # -----------------------------------------------------
        # Quantity already ordered through Purchase Orders
        # -----------------------------------------------------
        ordered = frappe.db.sql(
            """
            SELECT COALESCE(SUM(poi.stock_qty), 0)
            FROM `tabPurchase Order Item` poi
            INNER JOIN `tabPurchase Order` po
                ON po.name = poi.parent
            WHERE
                po.docstatus < 2
                AND poi.material_request = %s
                AND poi.material_request_item = %s
            """,
            (mr.name, mr_item.name)
        )

        ordered_qty = 0
        if ordered:
            ordered_qty = frappe.utils.flt(ordered[0][0])

        # -----------------------------------------------------
        # Calculate balance
        # -----------------------------------------------------
        balance_qty = requested_qty - transferred_qty - ordered_qty

        if balance_qty > 0.000001:
            total_balance += balance_qty

    # ---------------------------------------------------------
    # Check if there is anything to purchase
    # ---------------------------------------------------------
    if total_balance <= 0:
        frappe.throw(_("There is no remaining quantity available for purchase."))

    # ---------------------------------------------------------
    # Mark Material Request as available for purchase
    # ---------------------------------------------------------
    frappe.db.set_value(
        "Material Request",
        mr.name,
        "custom_available_for_purchase",
        1
    )

    # ---------------------------------------------------------
    # Response
    # ---------------------------------------------------------
    message = (
        "Material Request "
        + mr.name
        + " is now available for purchase. "
        + "Remaining quantity: "
        + str(total_balance)
    )

    return {"message": message}