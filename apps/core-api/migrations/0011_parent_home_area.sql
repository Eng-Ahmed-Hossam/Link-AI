-- migrate:up
-- Parent distance (decided 2026-10-09): search measures from the browser's location when the
-- parent shares it (never stored), else from the parent's home area, else the Maadi sample point.
-- The home area is a NAME (as centres name their area); its point is the centre of the verified
-- centres in that area. No coordinates of a person are stored.
ALTER TABLE org.guardians ADD COLUMN home_area text CHECK (char_length(home_area) BETWEEN 1 AND 60);
GRANT UPDATE (home_area) ON org.guardians TO app_user;

-- migrate:down
REVOKE UPDATE (home_area) ON org.guardians FROM app_user;
ALTER TABLE org.guardians DROP COLUMN IF EXISTS home_area;
