-- incident-check.sql — static valid fixture for the query-verification pilot.
-- Bounded, read-only SELECT with one named bind and a verification_verdict column.
SELECT
    CASE
        WHEN COUNT(*) > 0 THEN 'verified'
        ELSE 'not_verified'
    END AS verification_verdict,
    MIN(case_reference) AS case_reference,
    COUNT(*) AS matched_rows
FROM incident_events
WHERE case_id = :case_id
GROUP BY case_id
