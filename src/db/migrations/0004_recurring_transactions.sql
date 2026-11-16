CREATE TABLE "recurring_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"wallet_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"type" varchar(16) NOT NULL,
	"amount" bigint NOT NULL,
	"description" varchar(300) NOT NULL,
	"frequency" varchar(20) NOT NULL,
	"interval_step" integer DEFAULT 1 NOT NULL,
	"day_of_month" integer,
	"day_of_week" integer,
	"start_date" timestamp with time zone DEFAULT now() NOT NULL,
	"end_date" timestamp with time zone,
	"auto_apply" boolean DEFAULT false NOT NULL,
	"next_run_at" timestamp with time zone NOT NULL,
	"last_run_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recurring_templates_amount_positive" CHECK ("recurring_templates"."amount" > 0),
	CONSTRAINT "recurring_templates_interval_positive" CHECK ("recurring_templates"."interval_step" >= 1),
	CONSTRAINT "recurring_templates_day_of_month_valid" CHECK ("recurring_templates"."day_of_month" IS NULL OR ("recurring_templates"."day_of_month" >= 1 AND "recurring_templates"."day_of_month" <= 31)),
	CONSTRAINT "recurring_templates_day_of_week_valid" CHECK ("recurring_templates"."day_of_week" IS NULL OR ("recurring_templates"."day_of_week" >= 0 AND "recurring_templates"."day_of_week" <= 6))
);
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "recurring_template_id" uuid;--> statement-breakpoint
ALTER TABLE "recurring_templates" ADD CONSTRAINT "recurring_templates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_templates" ADD CONSTRAINT "recurring_templates_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_templates" ADD CONSTRAINT "recurring_templates_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recurring_templates_user_idx" ON "recurring_templates" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "recurring_templates_user_active_next_run_idx" ON "recurring_templates" USING btree ("user_id","is_active","next_run_at");--> statement-breakpoint
CREATE INDEX "recurring_templates_wallet_idx" ON "recurring_templates" USING btree ("wallet_id");--> statement-breakpoint
CREATE INDEX "recurring_templates_category_idx" ON "recurring_templates" USING btree ("category_id");--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_recurring_template_id_recurring_templates_id_fk" FOREIGN KEY ("recurring_template_id") REFERENCES "public"."recurring_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transactions_recurring_template_id_idx" ON "transactions" USING btree ("recurring_template_id");