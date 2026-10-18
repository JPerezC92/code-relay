---
schema: v3
incident_id: "MOCK-000000"
system: <SYSTEM>
module: "MOCK - module"
countries: [COUNTRY]
campaign: "209900"
campaign_label: C99
status: in_progress
issue_type: <issue type>
created: "2099-01-01"
date_resolved: null
ticket_url: <ticket system URL>
connections: []
# Ticket's own tool-reported author, as returned by the ticket tool. Never fabricate or infer a value; report a missing value instead.
author: <author>
escalated_to: null
related_ticket: null
problem_ticket: null
symptom_ids: []
known_problem_ids: []
identification_verdict: pending
analyses:
  - session: 1
    started: null
    ended: null
---

## Summary

<symptom description — what the customer reported, campaign, country affected>

## Case

<!-- Include ONLY the fields relevant to the ticket. Possible fields (label : type): Entity:code · Entity Name:text · Order Id:number · SKU:number · Zone:number · Region:code · ERP:number. Delete every row and value containing MOCK. -->

| Field | Value |
|---|---|
| Entity      | MOCK-0000000 |
| Entity Name | MOCK NAME SURNAME |
| Zone        | MOCK-0000 |
| Region      | MOCK-00 |

## Analysis

### Step 1 — <step description>

- **Hypothesis:** <hypothesis>
- **Query type:** document / sql
- **Confirmed:** yes / no / inconclusive

```js
// <query here>
```

**Finding:** <finding confirmed or ruled out>

## Root Cause

<confirmed root cause — one or two sentences>

## Solution

<action applied or recommended to resolve>

## Conclusion

- <conclusion 1>
- <conclusion 2>

<!-- Imagen footer: when a response includes images, add one #### ImagenN sub-block
     per image at the end of the ### Response N block. Record the local file and,
     when the ticket system returned one, the remote location — both when both exist:
       - **path:** screenshots/NN_source_entity.png                        (ticket-folder-relative local file)
       - **url:** <ticket-system image URL>                                (remote ticket-system location)
     The path MUST be spelled ticket-folder-relative (screenshots/<filename>) and be a
     real file inside this ticket's screenshots folder — never repo-relative; always
     record url: when the ticket system returned one. Never fabricate either value. -->

## Responses

<!-- Mirror ONLY our own posted notes into this section, selected from the ticket
     tool's author evidence and note id — never a third-party or requester note and
     never the draft. An edit to a selected note updates its matching response block
     rather than appending a duplicate. Missing authorship is reported, never inferred. -->

### Response 1 — 2099-01-01 · note <id>

<text of the note sent to level-1 support>

#### Imagen1

- **path:** screenshots/01_source_entity.png
- **url:** <ticket-system image URL, when the ticket system returned one>
- **Notes:** <what the image shows, when the user takes the screenshot>
