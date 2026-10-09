-- migrate:up
-- R2b: payments and the double-entry ledger (docs/06 §5, docs/08, ADR-0002). Money is integer
-- piasters. Every money event is ONE ledger transaction whose entries balance (INV-01, checked by
-- a deferred constraint trigger at commit). Entries and transactions are append-only: a correction
-- is a new, reversing transaction. Nothing here is ever cached (BR-MNY-10).

CREATE TABLE ledger.payments (
  id                  uuid PRIMARY KEY,
  kind                text NOT NULL CHECK (kind IN ('enrolment', 'enrolment_renewal', 'rent_topup', 'subscription')),
  enrolment_id        uuid,                         -- → market.enrolments
  rent_invoice_id     uuid,
  subscription_id     uuid,
  payer_user_id       uuid,                         -- NULL only for seeded sample families without an account
  payee_type          text NOT NULL CHECK (payee_type IN ('teacher', 'centre', 'link')),
  payee_id            uuid,
  centre_id           uuid,
  amount_pt           bigint NOT NULL CHECK (amount_pt > 0),
  commission_pt       bigint CHECK (commission_pt >= 0 AND commission_pt <= amount_pt),
  commission_rule_id  uuid,                         -- snapshot at capture (BR-MNY-11)
  commission_rate_pct numeric(5,2),
  method              text NOT NULL CHECK (method IN ('card', 'wallet', 'fawry')),
  provider            text NOT NULL CHECK (provider IN ('paymob', 'fawry', 'kashier', 'fake')),
  provider_ref        text,
  fawry_reference     text,
  checkout_url        text,
  card_last4          text,
  status              text NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'pending', 'succeeded', 'failed',
                        'expired', 'refunded', 'partially_refunded', 'charged_back')),
  failure_reason      text,
  period_start        date,
  period_end          date,
  expires_at          timestamptz,
  succeeded_at        timestamptz,
  settled_at          timestamptz,
  released_at         timestamptz,                  -- P2 posted (BR-REF-01)
  idempotency_key     text NOT NULL UNIQUE,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (kind = 'subscription' OR centre_id IS NOT NULL),
  CHECK ((kind IN ('enrolment', 'enrolment_renewal')) = (enrolment_id IS NOT NULL)),
  CHECK ((kind = 'rent_topup') = (rent_invoice_id IS NOT NULL)),
  CHECK ((kind = 'subscription') = (subscription_id IS NOT NULL)),
  UNIQUE (provider, provider_ref)
);
CREATE INDEX payments_enrolment ON ledger.payments (enrolment_id, created_at);
CREATE INDEX payments_payee ON ledger.payments (payee_type, payee_id, succeeded_at);
CREATE INDEX payments_release ON ledger.payments (status) WHERE released_at IS NULL;
CREATE TRIGGER payments_touch BEFORE UPDATE ON ledger.payments FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE TABLE ledger.payment_mandates (
  id                 uuid PRIMARY KEY,
  guardian_id        uuid NOT NULL,
  enrolment_id       uuid NOT NULL UNIQUE,
  provider           text NOT NULL,
  provider_token_ref text NOT NULL,              -- opaque token ID. NO card data (BR-MNY-06)
  card_brand         text,
  card_last4         text,
  card_exp_month     smallint,
  card_exp_year      smallint,
  status             text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER mandates_touch BEFORE UPDATE ON ledger.payment_mandates FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

-- Webhook dedupe: one row per provider event (07 §1 Idempotency).
CREATE TABLE ledger.provider_events (
  id              uuid PRIMARY KEY,
  provider        text NOT NULL,
  event_id        text NOT NULL,
  type            text NOT NULL,
  payload         jsonb NOT NULL,                -- personal data removed
  signature_valid boolean NOT NULL,
  outcome         text,                          -- what the handler did (for ops)
  received_at     timestamptz NOT NULL DEFAULT now(),
  processed_at    timestamptz,
  UNIQUE (provider, event_id)
);

CREATE TABLE ledger.refunds (
  id                     uuid PRIMARY KEY,
  payment_id             uuid NOT NULL REFERENCES ledger.payments (id),
  amount_pt              bigint NOT NULL CHECK (amount_pt > 0),
  commission_reversed_pt bigint NOT NULL DEFAULT 0 CHECK (commission_reversed_pt >= 0),
  policy                 text NOT NULL CHECK (policy IN ('before_first_session', 'dispute', 'teacher_declined',
                           'group_cancelled', 'late_payment_no_seat', 'chargeback')),
  destination            text NOT NULL DEFAULT 'original_method' CHECK (destination IN ('original_method', 'wallet', 'bank')),
  status                 text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'approved', 'processing',
                           'succeeded', 'failed', 'rejected')),
  auto_eligible          boolean NOT NULL DEFAULT false,
  enrolment_id           uuid,
  reason                 text,
  requested_by           uuid,
  approved_by            uuid,                    -- NULL for automatic compensation (OD-42)
  approved_at            timestamptz,
  provider_ref           text,
  idempotency_key        text NOT NULL UNIQUE,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refunds_payment ON ledger.refunds (payment_id);
CREATE INDEX refunds_enrolment ON ledger.refunds (enrolment_id, created_at);
CREATE TRIGGER refunds_touch BEFORE UPDATE ON ledger.refunds FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

-- Σ refunds never exceed the payment (06 refunds.amount_pt).
CREATE FUNCTION ledger.check_refund_total() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE paid bigint; total bigint;
BEGIN
  SELECT amount_pt INTO paid FROM ledger.payments WHERE id = NEW.payment_id FOR UPDATE;
  SELECT coalesce(sum(amount_pt), 0) INTO total FROM ledger.refunds
  WHERE payment_id = NEW.payment_id AND status NOT IN ('rejected', 'failed');
  IF total > paid THEN
    RAISE EXCEPTION 'refunds % exceed the payment %', total, paid
      USING ERRCODE = 'check_violation', CONSTRAINT = 'refunds_exceed_payment';
  END IF;
  RETURN NEW;
END
$$;
CREATE CONSTRAINT TRIGGER refunds_total AFTER INSERT OR UPDATE OF amount_pt, status ON ledger.refunds
  FOR EACH ROW EXECUTE FUNCTION ledger.check_refund_total();

-- ── The ledger (08 §1–2) ───────────────────────────────────────────────────────
CREATE TABLE ledger.ledger_accounts (
  id         uuid PRIMARY KEY,
  code       text NOT NULL UNIQUE,                -- e.g. teacher_pending:{teacherId}
  type       text NOT NULL CHECK (type IN ('asset', 'liability', 'revenue', 'expense')),
  owner_type text NOT NULL CHECK (owner_type IN ('link', 'teacher', 'centre', 'provider')),
  owner_id   uuid,
  currency   text NOT NULL DEFAULT 'EGP' CHECK (currency = 'EGP'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ledger.ledger_transactions (
  id              uuid PRIMARY KEY,
  kind            text NOT NULL CHECK (kind IN ('payment_captured', 'funds_released', 'rent_deduction', 'rent_topup',
                    'rent_reversal', 'payout_initiated', 'payout_settled', 'payout_failed', 'refund', 'refund_confirmed',
                    'refund_failed', 'chargeback', 'settlement', 'adjustment')),
  idempotency_key text NOT NULL UNIQUE,           -- one effect per money event
  payment_id      uuid,
  refund_id       uuid,
  rent_invoice_id uuid,
  payout_id       uuid,
  centre_id       uuid,
  teacher_id      uuid,
  reverses_id     uuid REFERENCES ledger.ledger_transactions (id),   -- a correction names what it reverses
  description     text NOT NULL,
  occurred_at     timestamptz NOT NULL DEFAULT now(),
  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ltx_payment ON ledger.ledger_transactions (payment_id);
CREATE INDEX ltx_teacher ON ledger.ledger_transactions (teacher_id, occurred_at);
CREATE INDEX ltx_centre ON ledger.ledger_transactions (centre_id, occurred_at);

CREATE TABLE ledger.ledger_entries (
  id             uuid PRIMARY KEY,
  transaction_id uuid NOT NULL REFERENCES ledger.ledger_transactions (id),
  account_id     uuid NOT NULL REFERENCES ledger.ledger_accounts (id),
  debit_pt       bigint NOT NULL DEFAULT 0 CHECK (debit_pt >= 0),
  credit_pt      bigint NOT NULL DEFAULT 0 CHECK (credit_pt >= 0),
  payment_id     uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CHECK ((debit_pt = 0) <> (credit_pt = 0))       -- exactly one side per line
);
CREATE INDEX entries_account ON ledger.ledger_entries (account_id, created_at);
CREATE INDEX entries_transaction ON ledger.ledger_entries (transaction_id);

-- INV-01: Σ debit = Σ credit for every transaction, checked at commit.
CREATE FUNCTION ledger.check_balanced() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE d bigint; c bigint;
BEGIN
  SELECT coalesce(sum(debit_pt), 0), coalesce(sum(credit_pt), 0) INTO d, c
  FROM ledger.ledger_entries WHERE transaction_id = NEW.transaction_id;
  IF d <> c OR d = 0 THEN
    RAISE EXCEPTION 'ledger transaction % does not balance (debit %, credit %)', NEW.transaction_id, d, c
      USING ERRCODE = 'check_violation', CONSTRAINT = 'ledger_unbalanced';
  END IF;
  RETURN NULL;
END
$$;
CREATE CONSTRAINT TRIGGER entries_balanced AFTER INSERT ON ledger.ledger_entries
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ledger.check_balanced();

-- Append-only: corrections are reversing transactions, never edits (ADR-0002, P11).
CREATE FUNCTION ledger.append_only() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: post a reversing transaction instead', TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END
$$;
CREATE TRIGGER entries_append_only BEFORE UPDATE OR DELETE ON ledger.ledger_entries
  FOR EACH ROW EXECUTE FUNCTION ledger.append_only();
CREATE TRIGGER transactions_append_only BEFORE UPDATE OR DELETE ON ledger.ledger_transactions
  FOR EACH ROW EXECUTE FUNCTION ledger.append_only();

-- Balance of an account in its normal side (08 §1): credit-normal = Σ credit − Σ debit.
CREATE FUNCTION ledger.balance_of(p_code text) RETURNS bigint
  LANGUAGE sql STABLE AS $$
  SELECT coalesce(sum(CASE WHEN a.type IN ('asset', 'expense') THEN e.debit_pt - e.credit_pt
                           ELSE e.credit_pt - e.debit_pt END), 0)::bigint
  FROM ledger.ledger_accounts a JOIN ledger.ledger_entries e ON e.account_id = a.id
  WHERE a.code = p_code
$$;

-- ── Rent invoices (08 §6) ──────────────────────────────────────────────────────
CREATE TABLE ledger.rent_invoices (
  id                      uuid PRIMARY KEY,
  room_booking_id         uuid NOT NULL,
  centre_id               uuid NOT NULL,
  teacher_id              uuid NOT NULL,
  period                  daterange NOT NULL,
  sessions_count          int NOT NULL DEFAULT 0,
  student_sessions_count  int NOT NULL DEFAULT 0,
  fees_base_pt            bigint NOT NULL DEFAULT 0,
  fees_base_adjustment_pt bigint NOT NULL DEFAULT 0 CHECK (fees_base_adjustment_pt <= 0),
  fees_base_carried_pt    bigint NOT NULL DEFAULT 0 CHECK (fees_base_carried_pt <= 0),
  gross_amount_pt         bigint NOT NULL CHECK (gross_amount_pt >= 0),
  link_fee_pct            numeric(5,2) NOT NULL,
  link_fee_amount_pt      bigint NOT NULL CHECK (link_fee_amount_pt >= 0),
  net_to_centre_pt        bigint NOT NULL,
  commission_rule_id      uuid,
  deducted_pt             bigint NOT NULL DEFAULT 0 CHECK (deducted_pt >= 0),
  topup_paid_pt           bigint NOT NULL DEFAULT 0 CHECK (topup_paid_pt >= 0),
  status                  text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'issued', 'partially_paid', 'paid', 'overdue', 'void')),
  issued_at               timestamptz,
  due_on                  date,
  settled_at              timestamptz,
  calculation             jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_booking_id, period),
  CHECK (fees_base_carried_pt = LEAST(0, fees_base_pt + fees_base_adjustment_pt)),
  CHECK (net_to_centre_pt = gross_amount_pt - link_fee_amount_pt),
  CHECK (deducted_pt + topup_paid_pt <= gross_amount_pt),
  CHECK ((status = 'paid') = (deducted_pt + topup_paid_pt = gross_amount_pt AND status NOT IN ('draft', 'void')))
);
CREATE INDEX rent_invoices_teacher ON ledger.rent_invoices (teacher_id, period);
CREATE INDEX rent_invoices_centre ON ledger.rent_invoices (centre_id, period);
CREATE TRIGGER rent_invoices_touch BEFORE UPDATE ON ledger.rent_invoices FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE TABLE ledger.payout_accounts (
  id                    uuid PRIMARY KEY,
  owner_type            text NOT NULL CHECK (owner_type IN ('teacher', 'centre')),
  owner_id              uuid NOT NULL,
  kind                  text NOT NULL CHECK (kind IN ('bank', 'wallet')),
  details_encrypted     bytea,                    -- [PII] IBAN or wallet number
  holder_name_encrypted bytea,                    -- [PII]
  display_last4         text NOT NULL,
  status                text NOT NULL DEFAULT 'pending_verification' CHECK (status IN ('pending_verification', 'verified', 'failed', 'replaced')),
  verified_at           timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX payout_accounts_live ON ledger.payout_accounts (owner_type, owner_id)
  WHERE status IN ('pending_verification', 'verified');

-- Reconciliation (08 §7): the provider's settlement report, matched line by line.
CREATE TABLE ledger.provider_settlement_lines (
  id                 uuid PRIMARY KEY,
  provider           text NOT NULL,
  settlement_date    date NOT NULL,
  provider_ref       text NOT NULL,
  kind               text NOT NULL CHECK (kind IN ('payment', 'refund', 'payout', 'fee', 'chargeback')),
  amount_pt          bigint NOT NULL,
  fee_pt             bigint NOT NULL DEFAULT 0,
  matched_payment_id uuid,
  matched_refund_id  uuid,
  matched_payout_id  uuid,
  match_status       text NOT NULL CHECK (match_status IN ('matched', 'unmatched', 'mismatch')),
  raw                jsonb NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_ref, kind)
);
CREATE TABLE ledger.reconciliation_issues (
  id          uuid PRIMARY KEY,
  provider    text NOT NULL,
  line_id     uuid REFERENCES ledger.provider_settlement_lines (id),
  kind        text NOT NULL CHECK (kind IN ('missing_in_ledger', 'missing_at_provider', 'amount_mismatch', 'orphan_payment', 'late_fawry')),
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  resolution  text,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ── RLS: payer and payee read their own rows; every write is SYSTEM (the money paths) ──────────
ALTER TABLE ledger.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY pay_payer ON ledger.payments FOR SELECT TO app_user USING (payer_user_id = platform.ctx_user_id());
CREATE POLICY pay_teacher ON ledger.payments FOR SELECT TO app_user
  USING (payee_type = 'teacher' AND payee_id = platform.ctx_teacher_id());
CREATE POLICY pay_centre ON ledger.payments FOR SELECT TO app_user
  USING (payee_type = 'centre' AND payee_id = ANY (platform.ctx_centre_ids()));
CREATE POLICY pay_system ON ledger.payments TO app_worker USING (true) WITH CHECK (true);
CREATE POLICY pay_ops ON ledger.payments FOR SELECT TO app_ops USING (platform.ctx_is_ops());

ALTER TABLE ledger.payment_mandates ENABLE ROW LEVEL SECURITY;
CREATE POLICY mand_guardian ON ledger.payment_mandates FOR SELECT TO app_user USING (guardian_id = platform.ctx_guardian_id());
CREATE POLICY mand_system ON ledger.payment_mandates TO app_worker USING (true) WITH CHECK (true);
CREATE POLICY mand_ops ON ledger.payment_mandates FOR SELECT TO app_ops USING (platform.ctx_is_ops());

ALTER TABLE ledger.provider_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY pe_system ON ledger.provider_events TO app_worker USING (true) WITH CHECK (true);
CREATE POLICY pe_ops ON ledger.provider_events FOR SELECT TO app_ops USING (platform.ctx_is_ops());

ALTER TABLE ledger.refunds ENABLE ROW LEVEL SECURITY;
CREATE POLICY ref_payer ON ledger.refunds FOR SELECT TO app_user
  USING (payment_id IN (SELECT p.id FROM ledger.payments p WHERE p.payer_user_id = platform.ctx_user_id()));
CREATE POLICY ref_teacher ON ledger.refunds FOR SELECT TO app_user
  USING (payment_id IN (SELECT p.id FROM ledger.payments p WHERE p.payee_type = 'teacher' AND p.payee_id = platform.ctx_teacher_id()));
CREATE POLICY ref_system ON ledger.refunds TO app_worker USING (true) WITH CHECK (true);
CREATE POLICY ref_ops ON ledger.refunds FOR SELECT TO app_ops USING (platform.ctx_is_ops());

ALTER TABLE ledger.ledger_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger.ledger_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger.ledger_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY la_system ON ledger.ledger_accounts TO app_worker USING (true) WITH CHECK (true);
CREATE POLICY la_ops ON ledger.ledger_accounts FOR SELECT TO app_ops USING (platform.ctx_is_ops());
CREATE POLICY lt_system ON ledger.ledger_transactions TO app_worker USING (true) WITH CHECK (true);
CREATE POLICY lt_ops ON ledger.ledger_transactions FOR SELECT TO app_ops USING (platform.ctx_is_ops());
CREATE POLICY le_system ON ledger.ledger_entries TO app_worker USING (true) WITH CHECK (true);
CREATE POLICY le_ops ON ledger.ledger_entries FOR SELECT TO app_ops USING (platform.ctx_is_ops());

ALTER TABLE ledger.rent_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY ri_teacher ON ledger.rent_invoices FOR SELECT TO app_user USING (teacher_id = platform.ctx_teacher_id());
CREATE POLICY ri_centre ON ledger.rent_invoices FOR SELECT TO app_user USING (centre_id = ANY (platform.ctx_centre_ids()));
CREATE POLICY ri_system ON ledger.rent_invoices TO app_worker USING (true) WITH CHECK (true);
CREATE POLICY ri_ops ON ledger.rent_invoices FOR SELECT TO app_ops USING (platform.ctx_is_ops());

ALTER TABLE ledger.payout_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY pa_teacher ON ledger.payout_accounts FOR SELECT TO app_user
  USING (owner_type = 'teacher' AND owner_id = platform.ctx_teacher_id());
CREATE POLICY pa_centre ON ledger.payout_accounts FOR SELECT TO app_user
  USING (owner_type = 'centre' AND owner_id = ANY (platform.ctx_centre_ids()));
CREATE POLICY pa_system ON ledger.payout_accounts TO app_worker USING (true) WITH CHECK (true);
CREATE POLICY pa_ops ON ledger.payout_accounts FOR SELECT TO app_ops USING (platform.ctx_is_ops());

ALTER TABLE ledger.provider_settlement_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger.reconciliation_issues ENABLE ROW LEVEL SECURITY;
CREATE POLICY psl_system ON ledger.provider_settlement_lines TO app_worker USING (true) WITH CHECK (true);
CREATE POLICY psl_ops ON ledger.provider_settlement_lines FOR SELECT TO app_ops USING (platform.ctx_is_ops());
CREATE POLICY ri2_system ON ledger.reconciliation_issues TO app_worker USING (true) WITH CHECK (true);
CREATE POLICY ri2_ops ON ledger.reconciliation_issues FOR SELECT TO app_ops USING (platform.ctx_is_ops());

GRANT SELECT ON ledger.payments, ledger.payment_mandates, ledger.refunds, ledger.rent_invoices,
  ledger.payout_accounts TO app_user;
GRANT SELECT, INSERT, UPDATE ON ledger.payments, ledger.payment_mandates, ledger.provider_events, ledger.refunds,
  ledger.rent_invoices, ledger.payout_accounts, ledger.provider_settlement_lines, ledger.reconciliation_issues
  TO app_worker;
-- The ledger itself: insert and read only, for everyone (append-only, ADR-0002).
GRANT SELECT, INSERT ON ledger.ledger_accounts, ledger.ledger_transactions, ledger.ledger_entries TO app_worker;
GRANT SELECT ON ledger.payments, ledger.payment_mandates, ledger.provider_events, ledger.refunds,
  ledger.ledger_accounts, ledger.ledger_transactions, ledger.ledger_entries, ledger.rent_invoices,
  ledger.payout_accounts, ledger.provider_settlement_lines, ledger.reconciliation_issues TO app_ops;

-- migrate:down
DROP TABLE IF EXISTS ledger.reconciliation_issues, ledger.provider_settlement_lines, ledger.payout_accounts,
  ledger.rent_invoices, ledger.ledger_entries, ledger.ledger_transactions, ledger.ledger_accounts,
  ledger.refunds, ledger.provider_events, ledger.payment_mandates, ledger.payments;
DROP FUNCTION IF EXISTS ledger.balance_of(text);
DROP FUNCTION IF EXISTS ledger.append_only();
DROP FUNCTION IF EXISTS ledger.check_balanced();
DROP FUNCTION IF EXISTS ledger.check_refund_total();
