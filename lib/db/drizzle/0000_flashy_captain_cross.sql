CREATE TABLE "projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sites" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" serial PRIMARY KEY NOT NULL,
	"site_id" integer NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "strings" (
	"id" serial PRIMARY KEY NOT NULL,
	"location_id" integer NOT NULL,
	"name" text NOT NULL,
	"string_number" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "towers" (
	"id" serial PRIMARY KEY NOT NULL,
	"string_id" integer NOT NULL,
	"name" text NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"progress_status" text DEFAULT '' NOT NULL,
	"location_type" text DEFAULT 'Tower' NOT NULL,
	"connected_to" text,
	"count_on_string" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "phases" (
	"id" serial PRIMARY KEY NOT NULL,
	"location_id" integer NOT NULL,
	"phase_type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"required_image_count" integer DEFAULT 0 NOT NULL,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"rejected_by" text,
	"rejected_at" timestamp with time zone,
	"rejection_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "images" (
	"id" serial PRIMARY KEY NOT NULL,
	"drive_file_id" text,
	"image_url" text,
	"project_id" integer,
	"site_id" integer,
	"location_id" integer,
	"phase_id" integer NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"uploaded_by" text,
	"filename" text,
	"notes" text,
	"review_status" text DEFAULT 'pending' NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issues" (
	"id" serial PRIMARY KEY NOT NULL,
	"image_id" integer,
	"photo_id" text,
	"type" text NOT NULL,
	"severity" text NOT NULL,
	"description" text NOT NULL,
	"raised_by" text,
	"resolved" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"tower" text,
	"string" text,
	"cable" text,
	"resolved_by" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "decisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"image_id" integer,
	"phase_id" integer,
	"approved_by" text NOT NULL,
	"decision" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"phase_id" integer,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"generated_by" text NOT NULL,
	"title" text NOT NULL,
	"content" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"pack_type" text DEFAULT 'phase',
	"string_name" text,
	"osp_name" text,
	"wasabi_key" text,
	"photo_count" integer,
	"report_count" integer
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"display_name" text NOT NULL,
	"email" text,
	"title" text,
	"access_level" text DEFAULT 'viewer' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "sheet_photos" (
	"id" serial PRIMARY KEY NOT NULL,
	"photo_id" text,
	"photo_upload" text,
	"resized_photo" text,
	"signature_capture" text,
	"drawing_markup" text,
	"drive_file_id" text,
	"wasabi_key" text,
	"cable_link" text,
	"cable_side" text,
	"location_link" text,
	"photo_type" text,
	"phase_link" text,
	"phase_order" text,
	"photo_string" text,
	"req_img_type" text,
	"req_img_order" text,
	"photo_response" text,
	"data_capture_response" text,
	"comments" text,
	"termination_completed_by" text,
	"continuing_notes" text,
	"previous_response_import" text,
	"approval" text,
	"status" text,
	"review_details" text,
	"label" text,
	"parent_control" text,
	"parent" text,
	"creation_date_time" text,
	"creation_date" text,
	"creation_user" text,
	"creation_location" text,
	"edit_count" text,
	"edit_date_time" text,
	"edit_date" text,
	"edit_user" text,
	"edit_location" text,
	"update_flag" text,
	"automation_trigger" text,
	"form_type" text,
	"test_flag" text,
	"temp" text,
	"temp2" text,
	"temp3" text,
	"temp4" text,
	"resized_checked" text,
	"image_available" boolean,
	"review_comment" text,
	"crop_x" real,
	"crop_y" real,
	"crop_width" real,
	"crop_height" real,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sheet_photos_photo_id_unique" UNIQUE("photo_id")
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wasabi_mirror_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"root_folder_id" text NOT NULL,
	"drive_file_id" text NOT NULL,
	"file_name" text NOT NULL,
	"drive_path" text NOT NULL,
	"wasabi_key" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wasabi_mirror_tasks_drive_file_id_unique" UNIQUE("drive_file_id")
);
--> statement-breakpoint
CREATE TABLE "required_image_definitions" (
	"id" serial PRIMARY KEY NOT NULL,
	"phase_type" text NOT NULL,
	"req_img_type" text NOT NULL,
	"req_img_order" text,
	"description" text,
	"location_type" text DEFAULT 'both' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "required_image_definitions_phase_type_req_img_type_unique" UNIQUE("phase_type","req_img_type")
);
--> statement-breakpoint
CREATE TABLE "field_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"template_id" text NOT NULL,
	"osp_name" text NOT NULL,
	"string_name" text NOT NULL,
	"cable_name" text,
	"form_data" jsonb NOT NULL,
	"images" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_by" text NOT NULL,
	"finalized_at" timestamp with time zone,
	"wasabi_key" text,
	"mirror_task_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "installation_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"task_name" text NOT NULL,
	"task_type" text NOT NULL,
	"sequence" integer,
	"duration_hours" numeric(10, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "installation_tasks_task_id_unique" UNIQUE("task_id")
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"name" text NOT NULL,
	"start_date" text,
	"end_date" text,
	"completed_tooling_set" text,
	"vlf_test_set" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaigns_campaign_id_unique" UNIQUE("campaign_id")
);
--> statement-breakpoint
CREATE TABLE "location_task_progress" (
	"id" serial PRIMARY KEY NOT NULL,
	"progress_sheet_id" text NOT NULL,
	"task_id" text NOT NULL,
	"location" text NOT NULL,
	"string_name" text,
	"completed" boolean DEFAULT false NOT NULL,
	"start_date" text,
	"finish_date" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "location_task_progress_progress_sheet_id_unique" UNIQUE("progress_sheet_id")
);
--> statement-breakpoint
CREATE TABLE "task_progress_updates" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_progress_id" text NOT NULL,
	"linked_task_id" text NOT NULL,
	"location" text NOT NULL,
	"progress_pct" integer DEFAULT 0 NOT NULL,
	"completed_at" text,
	"duration_actual" numeric(10, 2),
	"work_activity" text,
	"created_by" text,
	"creation_datetime" text,
	"creation_location" text,
	"edit_datetime" text,
	"edit_user" text,
	"edit_location" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_progress_updates_task_progress_id_unique" UNIQUE("task_progress_id")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "mob_sites" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"location" text,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"expected_completion_date" date,
	"mobilisation_date" date,
	"client_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "certifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"validity_months" integer,
	"category" text,
	"auto_calculate_expiry" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "certifications_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "workers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"company" text,
	"winda_id" text,
	"role_id" integer,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"unique_id" text,
	"phone" text,
	"dob" text,
	"passport_no" text,
	"passport_issue_date" text,
	"passport_expiry_date" text,
	"passport_place_of_birth" text,
	"passport_wasabi_key" text,
	"nok_name" text,
	"nok_relationship" text,
	"nok_phone" text,
	"preferred_airport" text[],
	"qualifications" text,
	"cv_wasabi_key" text,
	"cv_uploaded_at" timestamp with time zone,
	"portal_username" text,
	"portal_password_hash" text,
	"last_login_at" timestamp with time zone,
	"last_login_ip" text,
	"install_review_access" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workers_email_unique" UNIQUE("email"),
	CONSTRAINT "workers_winda_id_unique" UNIQUE("winda_id"),
	CONSTRAINT "workers_portal_username_unique" UNIQUE("portal_username")
);
--> statement-breakpoint
CREATE TABLE "worker_certifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"worker_id" integer NOT NULL,
	"certification_id" integer NOT NULL,
	"date_achieved" date,
	"expiry_date" date,
	"verified" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp with time zone,
	"rejected" boolean DEFAULT false NOT NULL,
	"rejection_comment" text,
	"file_url" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "worker_cert_unique" UNIQUE("worker_id","certification_id")
);
--> statement-breakpoint
CREATE TABLE "role_cert_requirements" (
	"id" serial PRIMARY KEY NOT NULL,
	"role_id" integer NOT NULL,
	"certification_id" integer NOT NULL,
	"required" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_cert_req_unique" UNIQUE("role_id","certification_id")
);
--> statement-breakpoint
CREATE TABLE "site_cert_requirements" (
	"id" serial PRIMARY KEY NOT NULL,
	"site_id" integer NOT NULL,
	"certification_id" integer NOT NULL,
	"required" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_cert_req_unique" UNIQUE("site_id","certification_id")
);
--> statement-breakpoint
CREATE TABLE "worker_cert_overrides" (
	"id" serial PRIMARY KEY NOT NULL,
	"worker_id" integer NOT NULL,
	"certification_id" integer NOT NULL,
	"required" boolean NOT NULL,
	"reason" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "worker_cert_override_unique" UNIQUE("worker_id","certification_id")
);
--> statement-breakpoint
CREATE TABLE "site_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"worker_id" integer NOT NULL,
	"site_id" integer NOT NULL,
	"assigned_date" date,
	"mobilisation_date" date,
	"status" text DEFAULT 'active' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_assignment_unique" UNIQUE("worker_id","site_id")
);
--> statement-breakpoint
CREATE TABLE "email_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"worker_id" integer,
	"sent_by" integer,
	"to_email" text NOT NULL,
	"to_name" text NOT NULL,
	"subject" text NOT NULL,
	"body_html" text NOT NULL,
	"email_type" text NOT NULL,
	"status" text DEFAULT 'sent' NOT NULL,
	"error" text,
	"tracking_id" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"seen_at" timestamp with time zone,
	"seen_ip" text,
	CONSTRAINT "email_logs_tracking_id_unique" UNIQUE("tracking_id")
);
--> statement-breakpoint
CREATE TABLE "worker_activity_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"worker_id" integer NOT NULL,
	"action" text NOT NULL,
	"detail" text,
	"ip_address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_cert_requirements" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"certification_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_cert_req_unique" UNIQUE("client_id","certification_id")
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clients_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "ppe_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ppe_types_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "ppe_allocations" (
	"id" serial PRIMARY KEY NOT NULL,
	"worker_id" integer NOT NULL,
	"ppe_type_id" integer NOT NULL,
	"site_id" integer,
	"issued_at" date NOT NULL,
	"issued_by_user_id" integer,
	"size_spec" text,
	"returned_at" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "worker_rotation_periods" (
	"id" serial PRIMARY KEY NOT NULL,
	"assignment_id" integer NOT NULL,
	"planned_start" date NOT NULL,
	"planned_end" date,
	"status" text DEFAULT 'planned' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "worker_schedule_change_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"worker_id" integer NOT NULL,
	"rotation_period_id" integer NOT NULL,
	"requested_start" date,
	"requested_end" date,
	"reason" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"admin_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "worker_unavailability_periods" (
	"id" serial PRIMARY KEY NOT NULL,
	"worker_id" integer NOT NULL,
	"label" text,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "worker_role_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"worker_id" integer NOT NULL,
	"role_id" integer,
	"role_name_snapshot" text NOT NULL,
	"start_date" text NOT NULL,
	"end_date" text,
	"notes" text,
	"source" text,
	"sort_order" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strings" ADD CONSTRAINT "strings_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "towers" ADD CONSTRAINT "towers_string_id_strings_id_fk" FOREIGN KEY ("string_id") REFERENCES "public"."strings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phases" ADD CONSTRAINT "phases_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "images" ADD CONSTRAINT "images_phase_id_phases_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."phases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_image_id_images_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."images"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_phase_id_phases_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."phases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mob_sites" ADD CONSTRAINT "mob_sites_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workers" ADD CONSTRAINT "workers_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_certifications" ADD CONSTRAINT "worker_certifications_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_certifications" ADD CONSTRAINT "worker_certifications_certification_id_certifications_id_fk" FOREIGN KEY ("certification_id") REFERENCES "public"."certifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_cert_requirements" ADD CONSTRAINT "role_cert_requirements_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_cert_requirements" ADD CONSTRAINT "role_cert_requirements_certification_id_certifications_id_fk" FOREIGN KEY ("certification_id") REFERENCES "public"."certifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_cert_requirements" ADD CONSTRAINT "site_cert_requirements_site_id_mob_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."mob_sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_cert_requirements" ADD CONSTRAINT "site_cert_requirements_certification_id_certifications_id_fk" FOREIGN KEY ("certification_id") REFERENCES "public"."certifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_cert_overrides" ADD CONSTRAINT "worker_cert_overrides_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_cert_overrides" ADD CONSTRAINT "worker_cert_overrides_certification_id_certifications_id_fk" FOREIGN KEY ("certification_id") REFERENCES "public"."certifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_assignments" ADD CONSTRAINT "site_assignments_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_assignments" ADD CONSTRAINT "site_assignments_site_id_mob_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."mob_sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_sent_by_users_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_activity_logs" ADD CONSTRAINT "worker_activity_logs_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_cert_requirements" ADD CONSTRAINT "client_cert_requirements_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_cert_requirements" ADD CONSTRAINT "client_cert_requirements_certification_id_certifications_id_fk" FOREIGN KEY ("certification_id") REFERENCES "public"."certifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ppe_allocations" ADD CONSTRAINT "ppe_allocations_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ppe_allocations" ADD CONSTRAINT "ppe_allocations_ppe_type_id_ppe_types_id_fk" FOREIGN KEY ("ppe_type_id") REFERENCES "public"."ppe_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ppe_allocations" ADD CONSTRAINT "ppe_allocations_site_id_mob_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."mob_sites"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ppe_allocations" ADD CONSTRAINT "ppe_allocations_issued_by_user_id_users_id_fk" FOREIGN KEY ("issued_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_rotation_periods" ADD CONSTRAINT "worker_rotation_periods_assignment_id_site_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."site_assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_schedule_change_requests" ADD CONSTRAINT "worker_schedule_change_requests_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_schedule_change_requests" ADD CONSTRAINT "worker_schedule_change_requests_rotation_period_id_worker_rotation_periods_id_fk" FOREIGN KEY ("rotation_period_id") REFERENCES "public"."worker_rotation_periods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_unavailability_periods" ADD CONSTRAINT "worker_unavailability_periods_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_role_history" ADD CONSTRAINT "worker_role_history_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_role_history" ADD CONSTRAINT "worker_role_history_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE set null ON UPDATE no action;