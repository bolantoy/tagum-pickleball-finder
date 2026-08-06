-- ─── Seed Data — Sample Tagum City Pickleball Courts ─────────────────────────
-- Run AFTER schema.sql
-- ⚠️  Update these with real court data before going live.

INSERT INTO courts (name, address, latitude, longitude, website, phone, facebook, image, active, parser_name)
VALUES
  (
    'Pickleballers Space Tagum',
    'Tagum City, Davao del Norte, Philippines',
    7.4478,
    125.8087,
    'https://pickleballers.com/book',
    '+63 9XX XXX XXXX',
    'https://facebook.com/pickleballersspa',
    NULL,
    true,
    'pickleballers'
  ),
  (
    'Pickle City Tagum',
    'Tagum City, Davao del Norte, Philippines',
    7.4490,
    125.8100,
    'https://picklecity-tagum.com/book',
    '+63 9XX XXX XXXX',
    'https://facebook.com/picklecitytagum',
    NULL,
    true,
    'pickle_city'
  ),
  (
    'The Hideout Sports Facility',
    'Tagum City, Davao del Norte, Philippines',
    7.4460,
    125.8070,
    'https://thehideout-tagum.com/book',
    '+63 9XX XXX XXXX',
    'https://facebook.com/thehideouttagum',
    NULL,
    true,
    'hideout'
  );

-- Verify:
-- SELECT id, name, parser_name FROM courts;
