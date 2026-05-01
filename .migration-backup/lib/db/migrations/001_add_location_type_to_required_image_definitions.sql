-- Migration 001: Add location_type to required_image_definitions
-- Applied: 2026-04-29
-- Task #8 – Filter required images by location type
--
-- location_type values: 'TP' (tower platforms only), 'OSP' (offshore substation only), 'both'
-- Mapping: locations.type = 'tower' -> match TP + both
--          locations.type = 'OSP'   -> match OSP + both
--          locations.type = 'other' -> no match (empty result)

ALTER TABLE required_image_definitions
  ADD COLUMN IF NOT EXISTS location_type text NOT NULL DEFAULT 'both';
