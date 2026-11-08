


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."account_role" AS ENUM (
    'customer',
    'admin'
);


ALTER TYPE "public"."account_role" OWNER TO "postgres";


CREATE TYPE "public"."account_status" AS ENUM (
    'active',
    'inactive'
);


ALTER TYPE "public"."account_status" OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "account_id" "uuid" NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "transaction_type" character varying(20) NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "status" character varying(20) DEFAULT 'completed'::character varying NOT NULL,
    "description" character varying(255) DEFAULT ''::character varying NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "transactions_amount_check" CHECK (("amount" <> (0)::numeric)),
    CONSTRAINT "transactions_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['pending'::character varying, 'completed'::character varying, 'failed'::character varying])::"text"[]))),
    CONSTRAINT "transactions_transaction_type_check" CHECK ((("transaction_type")::"text" = ANY ((ARRAY['deposit'::character varying, 'withdrawal'::character varying, 'transfer'::character varying])::"text"[])))
);


ALTER TABLE "public"."transactions" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."post_account_transaction"("p_user_id" "uuid", "p_account_id" "uuid", "p_amount" numeric, "p_type" "text", "p_description" "text") RETURNS "public"."transactions"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  acct public.accounts;
  txn public.transactions;
begin
  select * into acct from public.accounts
    where id = p_account_id and user_id = p_user_id for update;
  if not found then raise exception 'account_not_found'; end if;
  if acct.status <> 'activated' then raise exception 'account_closed'; end if;
  if acct.balance + p_amount < 0 then raise exception 'insufficient_funds'; end if;

  update public.accounts set balance = balance + p_amount where id = p_account_id;
  insert into public.transactions (account_id, customer_id, transaction_type, amount, status, description)
    values (p_account_id, p_user_id, p_type, p_amount, 'completed', p_description)
    returning * into txn;
  return txn;
end;
$$;


ALTER FUNCTION "public"."post_account_transaction"("p_user_id" "uuid", "p_account_id" "uuid", "p_amount" numeric, "p_type" "text", "p_description" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."post_customer_transfer"("p_user_id" "uuid", "p_source_id" "uuid", "p_recipient_number" "text", "p_amount" numeric, "p_description" "text") RETURNS "public"."transactions"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  dest_id uuid;
  src public.accounts;
  dst public.accounts;
  sender public.users;
  debit public.transactions;
begin
  if p_amount <= 0 then raise exception 'invalid_amount'; end if;

  select id into dest_id from public.accounts where account_number = p_recipient_number;
  if dest_id is null then raise exception 'recipient_not_found'; end if;
  if dest_id = p_source_id then raise exception 'same_account'; end if;

  perform 1 from public.accounts where id in (p_source_id, dest_id) order by id for update;
  select * into src from public.accounts where id = p_source_id and user_id = p_user_id;
  select * into dst from public.accounts where id = dest_id;
  if src.id is null then raise exception 'account_not_found'; end if;
  if dst.user_id = p_user_id then raise exception 'own_account'; end if;
  if src.status <> 'activated' then raise exception 'account_closed'; end if;
  if dst.status <> 'activated' then raise exception 'recipient_not_found'; end if;
  if src.balance < p_amount then raise exception 'insufficient_funds'; end if;

  select * into sender from public.users where id = p_user_id;

  update public.accounts set balance = balance - p_amount where id = src.id;
  update public.accounts set balance = balance + p_amount where id = dst.id;

  insert into public.transactions (account_id, customer_id, transaction_type, amount, status, description)
    values (src.id, p_user_id, 'transfer', -p_amount, 'completed',
      coalesce(nullif(p_description, ''), 'Sent to account ending ' || right(dst.account_number, 4)))
    returning * into debit;
  insert into public.transactions (account_id, customer_id, transaction_type, amount, status, description)
    values (dst.id, dst.user_id, 'transfer', p_amount, 'completed',
      coalesce(nullif(p_description, ''), 'Received from ' || sender.first_name || ' ' || left(sender.last_name, 1) || '.'));

  return debit;
end;
$$;


ALTER FUNCTION "public"."post_customer_transfer"("p_user_id" "uuid", "p_source_id" "uuid", "p_recipient_number" "text", "p_amount" numeric, "p_description" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."post_transfer"("p_user_id" "uuid", "p_source_id" "uuid", "p_dest_id" "uuid", "p_amount" numeric, "p_description" "text") RETURNS SETOF "public"."transactions"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  src public.accounts;
  dst public.accounts;
begin
  if p_source_id = p_dest_id then raise exception 'same_account'; end if;
  if p_amount <= 0 then raise exception 'invalid_amount'; end if;

  perform 1 from public.accounts
    where id in (p_source_id, p_dest_id) and user_id = p_user_id order by id for update;
  select * into src from public.accounts where id = p_source_id and user_id = p_user_id;
  select * into dst from public.accounts where id = p_dest_id and user_id = p_user_id;
  if src.id is null or dst.id is null then raise exception 'account_not_found'; end if;
  if src.status <> 'activated' or dst.status <> 'activated' then raise exception 'account_closed'; end if;
  if src.balance < p_amount then raise exception 'insufficient_funds'; end if;

  update public.accounts set balance = balance - p_amount where id = src.id;
  update public.accounts set balance = balance + p_amount where id = dst.id;

  return query
    insert into public.transactions (account_id, customer_id, transaction_type, amount, status, description)
    values
      (src.id, p_user_id, 'transfer', -p_amount, 'completed',
        coalesce(nullif(p_description, ''), 'Transfer to ' || initcap(dst.account_type::text))),
      (dst.id, p_user_id, 'transfer', p_amount, 'completed',
        coalesce(nullif(p_description, ''), 'Transfer from ' || initcap(src.account_type::text)))
    returning *;
end;
$$;


ALTER FUNCTION "public"."post_transfer"("p_user_id" "uuid", "p_source_id" "uuid", "p_dest_id" "uuid", "p_amount" numeric, "p_description" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_due_payments"() RETURNS integer
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  due public.scheduled_payments;
  next_date date;
  processed integer := 0;
begin
  for due in
    select * from public.scheduled_payments
    where status = 'scheduled' and next_payment_date <= current_date
    order by next_payment_date
    for update skip locked
  loop
    begin
      perform public.post_account_transaction(
        due.customer_id, due.account_id, -due.amount, 'withdrawal', 'Bill payment: ' || due.recipient);

      if due.frequency = 'once' then
        update public.scheduled_payments set status = 'completed' where id = due.id;
      else
        next_date := due.next_payment_date;
        while next_date <= current_date loop
          next_date := case due.frequency
            when 'daily' then next_date + 1
            when 'weekly' then next_date + 7
            else (next_date + interval '1 month')::date
          end;
        end loop;
        update public.scheduled_payments set next_payment_date = next_date where id = due.id;
      end if;
    exception when others then
      update public.scheduled_payments set status = 'failed' where id = due.id;
    end;
    processed := processed + 1;
  end loop;
  return processed;
end;
$$;


ALTER FUNCTION "public"."process_due_payments"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_failed_login"("p_user_id" "uuid", "p_max_attempts" integer, "p_lock_seconds" integer) RETURNS timestamp with time zone
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  attempts integer;
  lock_until timestamptz;
begin
  select case when locked_until is not null and locked_until <= now() then 0 else failed_login_attempts end
    into attempts
    from public.users
    where id = p_user_id
    for update;

  if not found then
    return null;
  end if;

  attempts := attempts + 1;
  if attempts >= p_max_attempts then
    lock_until := now() + make_interval(secs => p_lock_seconds);
    update public.users set failed_login_attempts = 0, locked_until = lock_until where id = p_user_id;
    return lock_until;
  end if;

  update public.users set failed_login_attempts = attempts, locked_until = null where id = p_user_id;
  return null;
end;
$$;


ALTER FUNCTION "public"."record_failed_login"("p_user_id" "uuid", "p_max_attempts" integer, "p_lock_seconds" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."check_deposits" (
    "id" "uuid" NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "account_id" "uuid" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "front_image_path" "text" NOT NULL,
    "back_image_path" "text" NOT NULL,
    "front_sha256" character(64) NOT NULL,
    "back_sha256" character(64) NOT NULL,
    "transaction_id" "uuid",
    "routing_number" "text",
    "check_number" "text",
    "extracted_amount" numeric(12,2),
    "review_notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reviewed_at" timestamp with time zone,
    CONSTRAINT "check_deposits_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "check_deposits_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"]))),
    CONSTRAINT "distinct_check_sides" CHECK (("front_sha256" <> "back_sha256"))
);


ALTER TABLE "public"."check_deposits" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_check_deposit"("p_deposit_id" "uuid", "p_user_id" "uuid", "p_account_id" "uuid", "p_amount" numeric, "p_front_path" "text", "p_back_path" "text", "p_front_sha256" "text", "p_back_sha256" "text") RETURNS "public"."check_deposits"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  acct public.accounts;
  submitted public.check_deposits;
  txn_id uuid;
begin
  if p_amount <= 0 then raise exception 'invalid_amount'; end if;
  if p_front_sha256 = p_back_sha256 then raise exception 'same_photo'; end if;
  select * into acct from public.accounts
    where id = p_account_id and user_id = p_user_id for update;
  if not found then raise exception 'account_not_found'; end if;
  if acct.status <> 'activated' then raise exception 'account_closed'; end if;

  insert into public.check_deposits
    (id, customer_id, account_id, amount, front_image_path, back_image_path, front_sha256, back_sha256)
  values
    (p_deposit_id, p_user_id, p_account_id, p_amount, p_front_path, p_back_path, p_front_sha256, p_back_sha256)
  on conflict (customer_id, front_sha256, back_sha256) do nothing
  returning * into submitted;

  if submitted.id is null then
    select * into submitted from public.check_deposits
      where customer_id = p_user_id and front_sha256 = p_front_sha256 and back_sha256 = p_back_sha256;
    if submitted.account_id <> p_account_id or submitted.amount <> p_amount or submitted.status <> 'pending' then
      raise exception 'duplicate_check';
    end if;
    return submitted;
  end if;

  insert into public.transactions
    (account_id, customer_id, transaction_type, amount, status, description)
  values
    (p_account_id, p_user_id, 'deposit', p_amount, 'pending', 'Mobile check deposit')
  returning id into txn_id;

  update public.check_deposits set transaction_id = txn_id
    where id = p_deposit_id returning * into submitted;
  return submitted;
end;
$$;


ALTER FUNCTION "public"."submit_check_deposit"("p_deposit_id" "uuid", "p_user_id" "uuid", "p_account_id" "uuid", "p_amount" numeric, "p_front_path" "text", "p_back_path" "text", "p_front_sha256" "text", "p_back_sha256" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "account_number" character varying(20) NOT NULL,
    "account_type" character varying(20) NOT NULL,
    "balance" numeric(15,2) DEFAULT 0 NOT NULL,
    "status" character varying(20) DEFAULT 'activated'::character varying NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "closed_at" timestamp with time zone,
    CONSTRAINT "accounts_account_type_check" CHECK ((("account_type")::"text" = ANY ((ARRAY['checking'::character varying, 'savings'::character varying])::"text"[]))),
    CONSTRAINT "accounts_balance_check" CHECK (("balance" >= (0)::numeric)),
    CONSTRAINT "accounts_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['activated'::character varying, 'deactivated'::character varying])::"text"[])))
);


ALTER TABLE "public"."accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "actor_id" "uuid",
    "action" character varying(40) NOT NULL,
    "details" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."audit_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."scheduled_payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "account_id" "uuid" NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "recipient" character varying(100) NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "frequency" character varying(20) NOT NULL,
    "next_payment_date" "date" NOT NULL,
    "status" character varying(20) DEFAULT 'scheduled'::character varying NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "scheduled_payments_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "scheduled_payments_frequency_check" CHECK ((("frequency")::"text" = ANY ((ARRAY['once'::character varying, 'daily'::character varying, 'weekly'::character varying, 'monthly'::character varying])::"text"[]))),
    CONSTRAINT "scheduled_payments_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['scheduled'::character varying, 'completed'::character varying, 'canceled'::character varying, 'failed'::character varying])::"text"[])))
);


ALTER TABLE "public"."scheduled_payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" NOT NULL,
    "first_name" "text" NOT NULL,
    "last_name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "phone_number" "text",
    "role" "public"."account_role" DEFAULT 'customer'::"public"."account_role" NOT NULL,
    "status" "public"."account_status" DEFAULT 'active'::"public"."account_status" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "zip_code" "text",
    "failed_login_attempts" integer DEFAULT 0 NOT NULL,
    "locked_until" timestamp with time zone,
    CONSTRAINT "users_zip_code_check" CHECK (("zip_code" ~ '^[0-9]{5}$'::"text"))
);


ALTER TABLE "public"."users" OWNER TO "postgres";


ALTER TABLE ONLY "public"."accounts"
    ADD CONSTRAINT "accounts_account_number_key" UNIQUE ("account_number");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "accounts_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."accounts"
    ADD CONSTRAINT "accounts_pkey1" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."check_deposits"
    ADD CONSTRAINT "check_deposits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."check_deposits"
    ADD CONSTRAINT "check_deposits_transaction_id_key" UNIQUE ("transaction_id");



ALTER TABLE ONLY "public"."scheduled_payments"
    ADD CONSTRAINT "scheduled_payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."check_deposits"
    ADD CONSTRAINT "unique_check_photos" UNIQUE ("customer_id", "front_sha256", "back_sha256");



CREATE INDEX "accounts_user_id_idx" ON "public"."accounts" USING "btree" ("user_id");



CREATE INDEX "audit_log_customer_idx" ON "public"."audit_log" USING "btree" ("customer_id", "created_at" DESC);



CREATE INDEX "check_deposits_customer_created_idx" ON "public"."check_deposits" USING "btree" ("customer_id", "created_at" DESC);



CREATE INDEX "scheduled_payments_account_idx" ON "public"."scheduled_payments" USING "btree" ("account_id");



CREATE INDEX "scheduled_payments_customer_idx" ON "public"."scheduled_payments" USING "btree" ("customer_id");



CREATE INDEX "scheduled_payments_due_idx" ON "public"."scheduled_payments" USING "btree" ("status", "next_payment_date");



CREATE INDEX "transactions_account_created_idx" ON "public"."transactions" USING "btree" ("account_id", "created_at" DESC);



CREATE INDEX "transactions_customer_idx" ON "public"."transactions" USING "btree" ("customer_id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "accounts_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."accounts"
    ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."check_deposits"
    ADD CONSTRAINT "check_deposits_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id");



ALTER TABLE ONLY "public"."check_deposits"
    ADD CONSTRAINT "check_deposits_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."check_deposits"
    ADD CONSTRAINT "check_deposits_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id");



ALTER TABLE ONLY "public"."scheduled_payments"
    ADD CONSTRAINT "scheduled_payments_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id");



ALTER TABLE ONLY "public"."scheduled_payments"
    ADD CONSTRAINT "scheduled_payments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id");



CREATE POLICY "Customers can view own scheduled payments" ON "public"."scheduled_payments" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "customer_id"));



CREATE POLICY "Customers can view own transactions" ON "public"."transactions" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "customer_id"));



CREATE POLICY "Users can view own row" ON "public"."users" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "id"));



CREATE POLICY "Users can view their own accounts" ON "public"."accounts" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."audit_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."check_deposits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."scheduled_payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON TABLE "public"."transactions" TO "anon";
GRANT ALL ON TABLE "public"."transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."transactions" TO "service_role";



REVOKE ALL ON FUNCTION "public"."post_account_transaction"("p_user_id" "uuid", "p_account_id" "uuid", "p_amount" numeric, "p_type" "text", "p_description" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."post_account_transaction"("p_user_id" "uuid", "p_account_id" "uuid", "p_amount" numeric, "p_type" "text", "p_description" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."post_customer_transfer"("p_user_id" "uuid", "p_source_id" "uuid", "p_recipient_number" "text", "p_amount" numeric, "p_description" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."post_customer_transfer"("p_user_id" "uuid", "p_source_id" "uuid", "p_recipient_number" "text", "p_amount" numeric, "p_description" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."post_transfer"("p_user_id" "uuid", "p_source_id" "uuid", "p_dest_id" "uuid", "p_amount" numeric, "p_description" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."post_transfer"("p_user_id" "uuid", "p_source_id" "uuid", "p_dest_id" "uuid", "p_amount" numeric, "p_description" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."process_due_payments"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."process_due_payments"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_failed_login"("p_user_id" "uuid", "p_max_attempts" integer, "p_lock_seconds" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_failed_login"("p_user_id" "uuid", "p_max_attempts" integer, "p_lock_seconds" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON TABLE "public"."check_deposits" TO "service_role";



REVOKE ALL ON FUNCTION "public"."submit_check_deposit"("p_deposit_id" "uuid", "p_user_id" "uuid", "p_account_id" "uuid", "p_amount" numeric, "p_front_path" "text", "p_back_path" "text", "p_front_sha256" "text", "p_back_sha256" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."submit_check_deposit"("p_deposit_id" "uuid", "p_user_id" "uuid", "p_account_id" "uuid", "p_amount" numeric, "p_front_path" "text", "p_back_path" "text", "p_front_sha256" "text", "p_back_sha256" "text") TO "service_role";



GRANT ALL ON TABLE "public"."accounts" TO "anon";
GRANT ALL ON TABLE "public"."accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."accounts" TO "service_role";



GRANT ALL ON TABLE "public"."audit_log" TO "anon";
GRANT ALL ON TABLE "public"."audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_log" TO "service_role";



GRANT ALL ON TABLE "public"."scheduled_payments" TO "anon";
GRANT ALL ON TABLE "public"."scheduled_payments" TO "authenticated";
GRANT ALL ON TABLE "public"."scheduled_payments" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







