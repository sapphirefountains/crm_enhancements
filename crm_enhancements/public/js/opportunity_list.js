frappe.provide("frappe.listview_settings");

frappe.listview_settings['Opportunity'] = {
	add_fields: ["expected_closing", "status"],
	refresh: function (listview) {
		if (listview.view_name === 'Kanban') {
			setup_kanban_color_observer(listview);
		}
	}
};

function setup_kanban_color_observer(listview) {
	const targetNode = document.querySelector('.kanban-container');
	if (!targetNode) {
		// If container isn't ready, retry shortly
		setTimeout(() => setup_kanban_color_observer(listview), 200);
		return;
	}

	// Apply immediately first
	apply_kanban_colors(listview);

	// Setup observer for future changes (scrolling, dragging, etc)
	const observer = new MutationObserver((mutationsList) => {
		apply_kanban_colors(listview);
	});

	observer.observe(targetNode, { childList: true, subtree: true });

	// Cleanup when leaving the view
	$(document).on('route-change', () => {
		observer.disconnect();
	});
}

function apply_kanban_colors(listview) {
	if (!listview || !listview.data) return;

	const today = frappe.datetime.get_today();
	const next_7_days = frappe.datetime.add_days(today, 7);

	listview.data.forEach(doc => {
		// Escape single quotes in doc names for jQuery selector
		const safe_name = doc.name.replace(/'/g, "\\'");
		const $card = $(`.kanban-card[data-name='${safe_name}']`);

		if (!$card.length) return;

		// 1. Status Check: Exclude 'Closed Won' and 'Lost'
		if (doc.status === "Closed Won" || doc.status === "Lost") {
			$card.css('background-color', '');
			return;
		}

		// 2. Date Logic
		if (doc.expected_closing) {
			if (doc.expected_closing < today) {
				// Overdue -> Soft Red
				$card.css('background-color', '#ffebee');
			} else if (doc.expected_closing >= today && doc.expected_closing <= next_7_days) {
				// Within next 7 days -> Soft Yellow
				$card.css('background-color', '#fff9c4');
			} else {
				// More than 7 days out -> Default
				$card.css('background-color', '');
			}
		} else {
			// No date -> Default
			$card.css('background-color', '');
		}
	});
}
