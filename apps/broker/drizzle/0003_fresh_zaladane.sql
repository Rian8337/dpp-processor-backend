ALTER TABLE "users" DROP CONSTRAINT "users_role_check";--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_check" CHECK (role in ('owner', 'admin', 'manager'));