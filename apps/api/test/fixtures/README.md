# Test fixtures

`dispatch-webhooks.recorded.json` holds three signed webhook requests (`delivery.assigned`,
`delivery.picked_up`, `delivery.completed`) exactly as the dispatch service's outbox relay sent
them during its end-to-end delivery flow, with that test's secret. The dispatch repository keeps a
byte-identical copy (`apps/api/test/fixtures/webhooks.recorded.json`, recorded with
`RECORD_WEBHOOK_FIXTURE`, see its README there). `src/integrations/dispatch-contract.spec.ts`
checks that TopFlow's signature verifier accepts every request and its schema parses every body;
dispatch checks the same file with its own code. After a contract change, record the file again
in dispatch, copy it here unchanged and run both test suites.
