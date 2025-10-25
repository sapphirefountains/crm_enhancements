import frappe

# The enqueue function now accepts 'project_template' and passes it on.
@frappe.whitelist()
def enqueue_project_creation(opportunity_name, user, project_template):
    """
    Called by the client to quickly add the main task to the background queue.
    """
    frappe.enqueue(
        'crm_enhancements.crm_enhancements.api.create_project_from_opportunity_background',
        queue='long',
        timeout=1800,
        opportunity_name=opportunity_name,
        user=user,
        project_template=project_template # Pass the template to the background job
    )
    return {'status': 'queued'}


# The background worker now accepts 'project_template' and uses it.
def create_project_from_opportunity_background(opportunity_name, user, project_template):
    """
    This function does the heavy lifting in the background.
    """
    project_doc = None
    try:
        with frappe.utils.switch_user('Administrator'):
            opp = frappe.get_doc('Opportunity', opportunity_name)
            if opp.custom_created_project:
                return

            project = frappe.new_doc('Project')

            # THIS IS THE NEW LOGIC: Apply the selected template first.
            if project_template:
                project.project_template = project_template

            project.project_name = opp.custom_opportunity_name

            # --- All field and table mapping logic remains the same ---
            direct_mappings = {
                'custom_scope_rank': 'custom_scope_rank', 'custom_schedule_rank': 'custom_schedule_rank',
                'custom_budget_rank': 'custom_budget_rank', 'custom_description': 'custom_project_description',
                'custom_general_scope_description': 'custom_general_scope_description',
                'custom_project_start_date': 'expected_start_date', 'custom_project_end_date': 'expected_end_date',
                'custom_notes_for_scheduling': 'custom_notes_for_scheduling', 'custom_delivery_date_time': 'custom_delivery_date_time',
                'custom_setup_date_time': 'custom_setup_date_time', 'custom_event_date_time': 'custom_event_date_time',
                'custom_take_down_date_time': 'custom_take_down_date_time',
                'custom_delivery_date_time_notes': 'custom_delivery_date_time_notes',
                'custom_setup_date_time_notes': 'custom_setup_date_time_notes',
                'custom_event_date_time_notes': 'custom_event_date_time_notes',
                'custom_take_down_date_time_notes': 'custom_take_down_date_time_notes',
                'opportunity_amount': 'custom_project_dollar_amount', 'custom_estimated_cost': 'custom_project_cost',
                'party_name': 'customer'
            }
            for source_field, target_field in direct_mappings.items():
                project.set(target_field, opp.get(source_field))

            priority_order = ["Design", "Build", "Service", "Rent"]
            project_type_value = None

            value_streams = [d.get("value_stream") for d in opp.get("custom_value_stream")]

            for p in priority_order:
                if p in value_streams:
                    project_type_value = p
                    break

            if project_type_value:
                project.project_type = project_type_value

            child_table_mappings = {
                'custom_value_stream': 'custom_value_stream', 'custom_contacts__address_table': 'custom_contacts__address_table',
                'custom_scope_contributors': 'custom_scope_contributors', 'custom_design_customer_requests': 'custom_design_customer_requests',
                'custom_design_deliverables': 'custom_design_deliverables', 'custom_build_customer_requests': 'custom_build_customer_requests',
                'custom_build_deliverables': 'custom_build_deliverables', 'custom_service_customer_requests': 'custom_service_customer_requests',
                'custom_service_deliverables': 'custom_service_deliverables', 'custom_rent_customer_requests': 'custom_rent_customer_requests',
                'custom_rent_deliverables': 'custom_rent_deliverables'
            }
            for source_table, target_table in child_table_mappings.items():
                project.set(target_table, [])
                for source_row in opp.get(source_table):
                    new_row = project.append(target_table, {})
                    new_row.update(source_row.as_dict())

            project.insert(ignore_permissions=True)
            project_doc = project.as_dict()
            opp.custom_created_project = project.name
            opp.save(ignore_permissions=True)
            frappe.db.commit()

    except Exception:
        frappe.log_error(frappe.get_traceback(), "CRM Enhancements App Background Job Failed")

    # The real-time broadcast logic remains the same.
    frappe.publish_realtime(
        event='project_creation_status',
        message={
            'status': 'success' if project_doc else 'failed',
            'project_doc': project_doc,
            'opportunity_name': opportunity_name
        },
        user=user
    )
