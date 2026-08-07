frappe.pages['nh-invoice-by-time-d'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Sales & Profitability Dashboard',
		single_column: true
	});

	let $content = $('<div class="dashboard-content" style="padding-top: 15px;"></div>').appendTo(page.main);

	// 1. Add Filters in Top Bar
	let company_field = page.add_field({
		fieldname: 'company',
		label: __('Company'),
		fieldtype: 'Link',
		options: 'Company',
		default: frappe.defaults.get_user_default('company')
	});

	let from_date_field = page.add_field({
		fieldname: 'from_date',
		label: __('From Date'),
		fieldtype: 'Date'
	});

	let to_date_field = page.add_field({
		fieldname: 'to_date',
		label: __('To Date'),
		fieldtype: 'Date'
	});

	let item_group_field = page.add_field({
		fieldname: 'item_group',
		label: __('Item Group'),
		fieldtype: 'Link',
		options: 'Item Group'
	});

	let meal_type_field = page.add_field({
		fieldname: 'meal_type',
		label: __('Meal Type'),
		fieldtype: 'Select',
		options: '\nBreakfast\nLunch\nDinner'
	});

	let order_type_field = page.add_field({
		fieldname: 'order_type',
		label: __('Order Type'),
		fieldtype: 'Data'
	});

	// 2. Data Fetch & Chart Rendering Function
	function load_dashboard_data() {
		$content.html('<div style="text-align:center; padding: 40px; color: #64748b;">Loading Dashboard Data...</div>');

		frappe.call({
			method: 'hrcustomization_synergy.hrcustomization_synergy.page.nh_invoice_by_time_d.nh_invoice_by_time_d.get_dashboard_data',
			args: {
				filters: {
					company: company_field.get_value() || '',
					from_date: from_date_field.get_value() || '',
					to_date: to_date_field.get_value() || '',
					item_group: item_group_field.get_value() || '',
					meal_type: meal_type_field.get_value() || '',
					order_type: order_type_field.get_value() || ''
				}
			},
			callback: function(r) {
				$content.empty();
				if (r.message) {
					// Append HTML layout
					$content.html(r.message.html);

					// Render Item Group Bar Chart
					if (r.message.chart_item_group && r.message.chart_item_group.labels.length) {
						new frappe.Chart("#chart-item-group", {
							title: "Sales by Item Group",
							data: r.message.chart_item_group,
							type: 'bar',
							height: 250,
							colors: ['#3b82f6', '#10b981']
						});
					}

					// Render Meal Type Donut/Pie Chart
					if (r.message.chart_meal_type && r.message.chart_meal_type.labels.length) {
						new frappe.Chart("#chart-meal-type", {
							title: "Sales by Meal Type",
							data: r.message.chart_meal_type,
							type: 'donut',
							height: 250,
							colors: ['#f59e0b', '#ec4899', '#6366f1']
						});
					}
				} else {
					$content.html('<div style="text-align:center; padding: 40px;">No records found.</div>');
				}
			}
		});
	}

	page.add_inner_button(__('Refresh'), function() {
		load_dashboard_data();
	});

	load_dashboard_data();
};