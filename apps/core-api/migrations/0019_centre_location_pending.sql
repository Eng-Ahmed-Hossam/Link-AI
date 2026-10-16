-- migrate:up
-- Part B (2026-10-16): the centre's exact location on a real map. The live columns (`location`,
-- `governorate`, `area`, `address`, `street`, `landmark`) are what the public sees, and they only
-- ever hold what Link ops approved (CF-44, privacy: a pin is public only once verified). An owner's
-- edit lands in the `pending_*` columns and puts the location under review; ops approval copies
-- pending → live (ops console, old and new pins side by side). The owner can no longer write the
-- live columns at all, so no code path can publish an unreviewed pin.

ALTER TABLE org.centres
  ADD COLUMN street              text CHECK (char_length(street) <= 120),
  ADD COLUMN landmark            text CHECK (char_length(landmark) <= 120),
  ADD COLUMN pending_location    geography(Point, 4326),
  ADD COLUMN pending_governorate text CHECK (char_length(pending_governorate) <= 60),
  ADD COLUMN pending_area        text CHECK (char_length(pending_area) <= 60),
  ADD COLUMN pending_address     text CHECK (char_length(pending_address) <= 200),
  ADD COLUMN pending_street      text CHECK (char_length(pending_street) <= 120),
  ADD COLUMN pending_landmark    text CHECK (char_length(pending_landmark) <= 120),
  ADD COLUMN pending_at          timestamptz,
  -- A pending location is a whole location: a pin and an address together, or nothing.
  ADD CONSTRAINT centres_pending_whole CHECK (
    (pending_location IS NULL AND pending_address IS NULL AND pending_at IS NULL)
    OR (pending_location IS NOT NULL AND pending_address IS NOT NULL AND pending_at IS NOT NULL)
  );

-- The owner writes only the pending location; the live one is ops' (and the seed's, as owner).
REVOKE UPDATE (governorate, area, address, location) ON org.centres FROM app_user;
GRANT UPDATE (pending_location, pending_governorate, pending_area, pending_address, pending_street,
              pending_landmark, pending_at) ON org.centres TO app_user;
GRANT UPDATE (location, governorate, area, address, street, landmark, pending_location,
              pending_governorate, pending_area, pending_address, pending_street, pending_landmark,
              pending_at) ON org.centres TO app_ops;

-- CF-44, now on the pending location: a new pending pin puts the centre under review; a live pin
-- that moves without ops setting `verified` in the same statement goes under review too (a safety
-- net for any other path).
DROP TRIGGER centres_location_review ON org.centres;
CREATE OR REPLACE FUNCTION org.location_review() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.pending_location IS NOT NULL AND (
       NEW.pending_location IS DISTINCT FROM OLD.pending_location
       OR NEW.pending_address IS DISTINCT FROM OLD.pending_address
       OR NEW.pending_governorate IS DISTINCT FROM OLD.pending_governorate
       OR NEW.pending_area IS DISTINCT FROM OLD.pending_area
       OR NEW.pending_street IS DISTINCT FROM OLD.pending_street
       OR NEW.pending_landmark IS DISTINCT FROM OLD.pending_landmark) THEN
    NEW.location_status := 'under_review';
  ELSIF NEW.location IS DISTINCT FROM OLD.location
        AND NEW.location_status IS NOT DISTINCT FROM OLD.location_status THEN
    NEW.location_status := 'under_review';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER centres_location_review
  BEFORE UPDATE OF location, pending_location, pending_address, pending_governorate, pending_area,
                   pending_street, pending_landmark ON org.centres
  FOR EACH ROW EXECUTE FUNCTION org.location_review();

-- The public view gains the structured address (still only verified centres, live columns only).
CREATE OR REPLACE VIEW market.public_centres AS
  SELECT c.id, c.slug, c.name, c.about_en, c.about_ar, c.governorate, c.area, c.address,
         c.location, c.location_status, c.hours, jsonb_array_length(c.photos) AS photo_count,
         c.street, c.landmark
  FROM org.centres c
  WHERE c.verification = 'verified' AND c.archived_at IS NULL;

-- migrate:down
CREATE OR REPLACE VIEW market.public_centres AS
  SELECT c.id, c.slug, c.name, c.about_en, c.about_ar, c.governorate, c.area, c.address,
         c.location, c.location_status, c.hours, jsonb_array_length(c.photos) AS photo_count
  FROM org.centres c
  WHERE c.verification = 'verified' AND c.archived_at IS NULL;
DROP TRIGGER centres_location_review ON org.centres;
CREATE OR REPLACE FUNCTION org.location_review() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.location IS DISTINCT FROM OLD.location THEN
    NEW.location_status := 'under_review';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER centres_location_review BEFORE UPDATE OF location ON org.centres
  FOR EACH ROW EXECUTE FUNCTION org.location_review();
REVOKE UPDATE (location, governorate, area, address, street, landmark, pending_location,
               pending_governorate, pending_area, pending_address, pending_street, pending_landmark,
               pending_at) ON org.centres FROM app_ops;
REVOKE UPDATE (pending_location, pending_governorate, pending_area, pending_address, pending_street,
               pending_landmark, pending_at) ON org.centres FROM app_user;
GRANT UPDATE (governorate, area, address, location) ON org.centres TO app_user;
ALTER TABLE org.centres
  DROP CONSTRAINT centres_pending_whole,
  DROP COLUMN pending_at, DROP COLUMN pending_landmark, DROP COLUMN pending_street,
  DROP COLUMN pending_address, DROP COLUMN pending_area, DROP COLUMN pending_governorate,
  DROP COLUMN pending_location, DROP COLUMN landmark, DROP COLUMN street;
