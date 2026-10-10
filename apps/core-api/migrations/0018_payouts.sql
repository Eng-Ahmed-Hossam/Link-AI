-- migrate:up
-- Ship job S3: payouts being sent (BR-OUT-01…08, 08 §8, P6, MKT-OPS-11). Until a payout provider
-- is chosen (S4), a weekly batch is paid by hand: ops finance download the batch as a CSV, make
-- the bank or InstaPay transfers, then mark each payout settled or failed in the console. Every
-- write is SYSTEM (the money paths); payees read their own payouts.

CREATE TABLE ledger.payout_batches (
  id          uuid PRIMARY KEY,
  run_on      date NOT NULL UNIQUE,              -- the Thursday (Cairo) of the run (OD-04)
  provider    text NOT NULL CHECK (provider IN ('manual')),
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'exported', 'closed')),
  created_by  uuid,                              -- NULL: the weekly job
  exported_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER payout_batches_touch BEFORE UPDATE ON ledger.payout_batches
  FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

CREATE TABLE ledger.payouts (
  id                uuid PRIMARY KEY,
  batch_id          uuid NOT NULL REFERENCES ledger.payout_batches (id),
  payee_type        text NOT NULL CHECK (payee_type IN ('teacher', 'centre')),
  payee_id          uuid NOT NULL,
  period_start      date NOT NULL,                -- the run's Thursday: one payout per payee per week
  amount_pt         bigint NOT NULL CHECK (amount_pt > 0),
  payout_account_id uuid NOT NULL REFERENCES ledger.payout_accounts (id),
  provider          text NOT NULL CHECK (provider IN ('manual')),
  status            text NOT NULL DEFAULT 'initiated' CHECK (status IN ('initiated', 'settled', 'failed')),
  attempts          int NOT NULL DEFAULT 1 CHECK (attempts >= 1),
  -- BR-OUT-05: the same key on every attempt, so a provider never pays one period twice.
  idempotency_key   text NOT NULL UNIQUE,
  provider_ref      text,                         -- the bank or InstaPay reference ops type in
  failure_reason    text,
  settled_at        timestamptz,
  failed_at         timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'settled') = (settled_at IS NOT NULL))
);
-- BR-OUT-05: one payout per payee per period, whatever happens to it.
CREATE UNIQUE INDEX payouts_once ON ledger.payouts (payee_type, payee_id, period_start);
CREATE INDEX payouts_batch ON ledger.payouts (batch_id, status);
CREATE INDEX payouts_payee ON ledger.payouts (payee_type, payee_id, created_at DESC);
CREATE TRIGGER payouts_touch BEFORE UPDATE ON ledger.payouts
  FOR EACH ROW EXECUTE FUNCTION platform.touch_updated_at();

-- ledger_transactions.payout_id exists since 0009; P6 postings fill it.
CREATE INDEX ledger_transactions_payout ON ledger.ledger_transactions (payout_id) WHERE payout_id IS NOT NULL;

ALTER TABLE ledger.payout_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY pb_system ON ledger.payout_batches TO app_worker USING (true) WITH CHECK (true);
CREATE POLICY pb_ops ON ledger.payout_batches FOR SELECT TO app_ops USING (platform.ctx_is_ops());
GRANT SELECT, INSERT, UPDATE ON ledger.payout_batches TO app_worker;
GRANT SELECT ON ledger.payout_batches TO app_ops;

ALTER TABLE ledger.payouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY po_teacher ON ledger.payouts FOR SELECT TO app_user
  USING (payee_type = 'teacher' AND payee_id = platform.ctx_teacher_id());
CREATE POLICY po_centre ON ledger.payouts FOR SELECT TO app_user
  USING (payee_type = 'centre' AND payee_id = ANY (platform.ctx_centre_ids()));
CREATE POLICY po_system ON ledger.payouts TO app_worker USING (true) WITH CHECK (true);
CREATE POLICY po_ops ON ledger.payouts FOR SELECT TO app_ops USING (platform.ctx_is_ops());
GRANT SELECT ON ledger.payouts TO app_user, app_ops;
GRANT SELECT, INSERT, UPDATE ON ledger.payouts TO app_worker;

-- migrate:down
DROP INDEX ledger.ledger_transactions_payout;
DROP TABLE ledger.payouts;
DROP TABLE ledger.payout_batches;
