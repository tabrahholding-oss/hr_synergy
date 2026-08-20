frappe.pages['nh-invoice-by-time-d'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Sales Performance Dashboard',
		single_column: true
	});

	// Dynamically inject ApexCharts Library into Head if not loaded
	if (!window.ApexCharts) {
		let script = document.createElement('script');
		script.src = "https://cdn.jsdelivr.net/npm/apexcharts";
		document.head.appendChild(script);
	}

	// CHANGED: sticky filter bar — fixed so it stays visible on scroll, positioned below the page-head
	// CHANGED: bigger z-index gap + solid opaque backgrounds + overflow-anchor:none to stop the
	// "scroll up par label filters ke upar aa jana" glitch (browser scroll-anchoring artifact)
	let $stickyStyle = $('<style>')
		.text(`
			.page-container, .page-content, .container.page-body {
				overflow-anchor: none !important;
			}
			.page-head {
				position: sticky !important;
				top: 0 !important;
				z-index: 1000 !important;
				background: #fff !important;
				opacity: 1 !important;
			}
			.page-form,
			.page-form.frappe-card {
				position: sticky !important;
				top: 56px !important;
				z-index: 999 !important;
				background: #fff !important;
				opacity: 1 !important;
				box-shadow: 0 2px 4px rgba(0,0,0,0.06);
			}
			.dashboard-content h5,
			.dashboard-content .frappe-card {
				position: static !important;
			}
		`)
		.appendTo(document.head);

	let $content = $('<div class="dashboard-content" style="padding-top: 15px;"></div>').appendTo(page.main);

	// Filters Configurations
	let company_field = page.add_field({
		fieldname: 'company', label: __('Company'), fieldtype: 'Link', options: 'Company',
		default: frappe.defaults.get_user_default('company')
	});

	let from_date_field = page.add_field({ fieldname: 'from_date', label: __('From Date'), fieldtype: 'Date' });
	let to_date_field = page.add_field({ fieldname: 'to_date', label: __('To Date'), fieldtype: 'Date' });
	let item_group_field = page.add_field({ fieldname: 'item_group', label: __('Item Group'), fieldtype: 'Link', options: 'Item Group' });
	let meal_type_field = page.add_field({ fieldname: 'meal_type', label: __('Meal Type'), fieldtype: 'Select', options: '\nBreakfast\nLunch\nDinner' });
	let order_type_field = page.add_field({ fieldname: 'order_type', label: __('Order Type'), fieldtype: 'Link', options: 'Order Type' });
	let payment_method_field = page.add_field({ fieldname: 'payment_method', label: __('Payment Method'), fieldtype: 'Link', options: 'Mode of Payment' });

	function load_dashboard_data() {
		$content.html('<div style="text-align:center; padding: 40px; color: #64748b;">Loading System Components...</div>');

		frappe.call({
			method: 'hrcustomization_synergy.hrcustomization_synergy.page.nh_invoice_by_time_d.nh_invoice_by_time_d.get_dashboard_data',
			args: {
				filters: {
					company: company_field.get_value() || '',
					from_date: from_date_field.get_value() || '',
					to_date: to_date_field.get_value() || '',
					item_group: item_group_field.get_value() || '',
					meal_type: meal_type_field.get_value() || '',
					order_type: order_type_field.get_value() || '',
					payment_method: payment_method_field.get_value() || ''
				}
			},
			callback: function(r) {
				$content.empty();
				if (!r.message) {
					$content.html('<div style="text-align:center; padding: 40px;">No records found.</div>');
					return;
				}

				$content.html(r.message.html);

				// Ensure Library Execution Safety Check
				setTimeout(() => {
					if (!window.ApexCharts) return;

					// 1. IMAGE 2 MATCH: Item Group Donut Chart (Left Legends Matrix with Percentages)
					if (r.message.chart_item_group && r.message.chart_item_group.labels.length) {
						let igOptions = {
							series: r.message.chart_item_group.values,
							labels: r.message.chart_item_group.labels,
							chart: { type: 'donut', height: 320 },
							stroke: { width: 1, colors: ['#fff'] },
							plotOptions: {
								pie: {
									donut: {
										size: '65%',
										labels: {
											show: true,
											total: {
												show: true, label: 'Total Sales', color: '#64748b', fontSize: '12px',
												formatter: function (w) {
													return w.globals.seriesTotals.reduce((a, b) => a + b, 0).toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0});
												}
											}
										}
									}
								}
							},
							legend: {
								position: 'left', verticalAlign: 'center', fontSize: '12px', fontFamily: 'sans-serif',
								itemMargin: { vertical: 4 },
								formatter: function(val, opts) {
									let value = opts.w.globals.series[opts.seriesIndex];
									let total = opts.w.globals.seriesTotals.reduce((a, b) => a + b, 0);
									let percent = ((value / total) * 100).toFixed(1);
									return `${val} - ${value.toLocaleString()} (${percent}%)`;
								}
							},
							dataLabels: { enabled: false }
						};
						new ApexCharts(document.querySelector("#apex-chart-item-group"), igOptions).render();
					}

					// 2. IMAGE 1 MATCH: Sales vs Cost Area Smooth Curve Chart (Smooth Curve, Gradient Area, Bottom Legends)
					if (r.message.chart_sales_vs_cost && r.message.chart_sales_vs_cost.labels.length) {
						let scOptions = {
							series: [
								{ name: 'Sales', data: r.message.chart_sales_vs_cost.sales },
								{ name: 'Cost of Sales', data: r.message.chart_sales_vs_cost.cost }
							],
							chart: { type: 'area', height: 300, toolbar: { show: false } },
							colors: ['#2563eb', '#c084fc'], // Blue & Purple Palette
							stroke: { curve: 'smooth', width: 2.5 },
							fill: {
								type: 'gradient',
								gradient: { shadeIntensity: 1, opacityFrom: 0.25, opacityTo: 0.02 }
							},
							xaxis: { categories: r.message.chart_sales_vs_cost.labels, labels: { style: { fontSize: '10px' } } },
							yaxis: { labels: { style: { fontSize: '10px' } } },
							legend: { position: 'bottom', horizontalAlign: 'left', fontSize: '13px', fontWeight: 600 },
							dataLabels: { enabled: false }
						};
						new ApexCharts(document.querySelector("#apex-chart-sales-cost"), scOptions).render();
					}

					// 3. Payment Method Trend Line Chart
					if (r.message.chart_payment_method && r.message.chart_payment_method.labels.length) {
						let pmOptions = {
							series: [{ name: 'Amount', data: r.message.chart_payment_method.values }],
							chart: { type: 'line', height: 260, toolbar: { show: false } },
							stroke: { curve: 'straight', width: 3 },
							colors: ['#0d9488'],
							xaxis: { categories: r.message.chart_payment_method.labels }
						};
						new ApexCharts(document.querySelector("#apex-chart-payment-method"), pmOptions).render();
					}

					// 4. Meal Type Standard Donut Chart
					if (r.message.chart_meal_type && r.message.chart_meal_type.labels.length) {
						let mtOptions = {
							series: r.message.chart_meal_type.values,
							labels: r.message.chart_meal_type.labels,
							chart: { type: 'donut', height: 260 },
							legend: { position: 'bottom' }
						};
						new ApexCharts(document.querySelector("#apex-chart-meal-type"), mtOptions).render();
					}
				}, 100);
			}
		});
	}

	// Dynamic Watcher Event Loop Hooks
	let all_fields = [company_field, from_date_field, to_date_field, item_group_field, meal_type_field, order_type_field, payment_method_field];
	all_fields.forEach(field => {
		field.df.onchange = () => load_dashboard_data();
		if(field.$input) field.$input.on('change visual-change input', () => load_dashboard_data());
	});

	// CHANGED: Refresh button color set to red
	let refresh_btn = page.add_inner_button(__('Refresh'), () => load_dashboard_data());
	refresh_btn.css({
		'background-color': '#ef4444',
		'border-color': '#ef4444',
		'color': '#fff'
	});

	load_dashboard_data();
};