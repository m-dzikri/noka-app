CREATE TABLE "debt_settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"debt_id" uuid NOT NULL,
	"wallet_id" uuid,
	"transaction_id" uuid,
	"amount" bigint NOT NULL,
	"notes" varchar(255),
	"settled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "debt_settlements_amount_positive" CHECK ("debt_settlements"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "debts_receivables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" varchar(16) NOT NULL,
	"person_name" varchar(100) NOT NULL,
	"total_amount" bigint NOT NULL,
	"settled_amount" bigint DEFAULT 0 NOT NULL,
	"due_date" timestamp with time zone,
	"notes" text,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "debts_receivables_total_amount_positive" CHECK ("debts_receivables"."total_amount" > 0),
	CONSTRAINT "debts_receivables_settled_amount_non_negative" CHECK ("debts_receivables"."settled_amount" >= 0)
);
--> statement-breakpoint
ALTER TABLE "debt_settlements" ADD CONSTRAINT "debt_settlements_debt_id_debts_receivables_id_fk" FOREIGN KEY ("debt_id") REFERENCES "public"."debts_receivables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debt_settlements" ADD CONSTRAINT "debt_settlements_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debt_settlements" ADD CONSTRAINT "debt_settlements_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debts_receivables" ADD CONSTRAINT "debts_receivables_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "debt_settlements_debt_id_idx" ON "debt_settlements" USING btree ("debt_id");--> statement-breakpoint
CREATE INDEX "debt_settlements_wallet_id_idx" ON "debt_settlements" USING btree ("wallet_id");--> statement-breakpoint
CREATE INDEX "debt_settlements_transaction_id_idx" ON "debt_settlements" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "debts_receivables_user_status_idx" ON "debts_receivables" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "debts_receivables_user_type_idx" ON "debts_receivables" USING btree ("user_id","type");--> statement-breakpoint
CREATE INDEX "debts_receivables_user_due_date_idx" ON "debts_receivables" USING btree ("user_id","due_date");