CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor" text DEFAULT 'system' NOT NULL,
	"action" text NOT NULL,
	"entity" text,
	"entity_id" text,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"stage" text DEFAULT 'not_started' NOT NULL,
	"package_type" text DEFAULT 'listing',
	"package_value" integer,
	"owner" text DEFAULT 'operator',
	"notes" text,
	"won_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outreach_sequences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"person_id" uuid,
	"channel" text DEFAULT 'email' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid,
	"name" text NOT NULL,
	"title" text,
	"linkedin" text,
	"email" text,
	"telegram" text,
	"verified" boolean DEFAULT false NOT NULL,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"source" text NOT NULL,
	"external_id" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"website" text,
	"ticker" text,
	"chain" text,
	"source" text NOT NULL,
	"esma_token_id" text,
	"dti" text,
	"jurisdiction" text,
	"whitepaper_url" text,
	"category" text,
	"market_cap" text,
	"listed_on_lcx" boolean DEFAULT false NOT NULL,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"eu_score" integer DEFAULT 0 NOT NULL,
	"us_pre_score" integer DEFAULT 0 NOT NULL,
	"us_post_score" integer DEFAULT 0 NOT NULL,
	"band" text DEFAULT 'unscored' NOT NULL,
	"reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppression" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text,
	"linkedin" text,
	"reason" text,
	"project_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_sequences" ADD CONSTRAINT "outreach_sequences_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_sequences" ADD CONSTRAINT "outreach_sequences_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_sources" ADD CONSTRAINT "project_sources_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scores" ADD CONSTRAINT "scores_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppression" ADD CONSTRAINT "suppression_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_audit_entity" ON "audit_log" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "idx_deals_project" ON "deals" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_deals_stage" ON "deals" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "idx_os_project" ON "outreach_sequences" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_people_project" ON "people" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_people_email" ON "people" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_src_project" ON "project_sources" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_src_source" ON "project_sources" USING btree ("source");--> statement-breakpoint
CREATE INDEX "idx_projects_listed" ON "projects" USING btree ("listed_on_lcx");--> statement-breakpoint
CREATE INDEX "idx_projects_name" ON "projects" USING btree ("name");--> statement-breakpoint
CREATE INDEX "idx_projects_source" ON "projects" USING btree ("source");--> statement-breakpoint
CREATE INDEX "idx_projects_ticker" ON "projects" USING btree ("ticker");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_projects_esma_token_id" ON "projects" USING btree ("esma_token_id");--> statement-breakpoint
CREATE INDEX "idx_scores_project" ON "scores" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_scores_band" ON "scores" USING btree ("band");--> statement-breakpoint
CREATE INDEX "idx_sig_project_kind" ON "signals" USING btree ("project_id","kind");--> statement-breakpoint
CREATE INDEX "idx_supp_email" ON "suppression" USING btree ("email");