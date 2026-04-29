frappe.ui.form.on('Air Ticket Availment', {
    employee: function(frm) {
        frm.set_value('accrued_ticket_till_posting_date', 0);
        frm.set_value('accrued_amount', 0);
    },

    posting_date: function(frm) {
        if (frm.doc.employee && frm.doc.posting_date) {
            frappe.call({
                method: 'frappe.client.get_list',
                args: {
                    doctype: 'Air Ticket Ledger Entry',
                    filters: {
                        employee: frm.doc.employee,
                        from_date: ['<=', frm.doc.posting_date],
                        to_date: ['<=', frm.doc.posting_date]
                    },
                    fields: ['sum(no_of_ticket) as total_ticket_balance', 'sum(amount) as total_accrued_amount'],
                },
                callback: function(response) {
                    if (response.message) {
                        const total_ticket_balance = response.message[0].total_ticket_balance || 0;
                        const total_accrued_amount = response.message[0].total_accrued_amount || 0;

                        frm.set_value('accrued_ticket_till_posting_date', total_ticket_balance);
                        frm.set_value('accrued_amount', total_accrued_amount);
                    }
                }
            });
        }
    }
});
