# Execution Tracing — `io.oap.observability.tracing`

**Version:** 2026-04-10

An **execution trace** is the observable record of what happened when a service processed a command. It captures the input, output, timing, and outcome — but NOT how the service worked internally.

## Execution Trace Shape

| Field | Type | Required | Description |
|---|---|---|---|
| `traceId` | string | yes | Unique trace identifier |
| `serviceId` | string | yes | Which service processed the command |
| `inputCommand` | Command | yes | The command that was processed |
| `outputEvents` | Event[] | yes | Events published as a result (may be empty) |
| `startedAt` | datetime | yes | ISO 8601 timestamp |
| `completedAt` | datetime | yes | ISO 8601 timestamp |
| `duration` | duration | yes | ISO 8601 duration |
| `succeeded` | boolean | yes | Whether processing completed without error |
| `error` | string | no | Error message if failed |
| `steps` | TraceStep[] | no | Optional named steps (implementation-specific) |

### TraceStep (optional)

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | yes | Step name |
| `duration` | duration | no | How long this step took |
| `succeeded` | boolean | no | Whether this step succeeded |
| `detail` | object | no | Opaque, implementation-specific detail |

### Example

```json
{
  "traceId": "trace-001",
  "serviceId": "negotiation",
  "inputCommand": {
    "specversion": "1.0",
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "source": "https://pm.example.com/negotiation-agent",
    "type": "ProposeCounter",
    "datacontenttype": "application/json",
    "dataschema": "https://api.example.com/schemas/commands/ProposeCounter.json",
    "time": "2025-07-01T10:30:00Z",
    "data": { "salary": 100000, "startDate": "2025-09-01" }
  },
  "outputEvents": [
    {
      "specversion": "1.0",
      "id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
      "source": "https://api.example.com/negotiation",
      "type": "CounterProposed",
      "datacontenttype": "application/json",
      "dataschema": "https://api.example.com/schemas/events/CounterProposed.json",
      "time": "2025-07-01T10:30:01Z",
      "data": { "salary": 100000, "startDate": "2025-09-01", "contractId": "contract-42" }
    }
  ],
  "startedAt": "2025-07-01T10:30:00Z",
  "completedAt": "2025-07-01T10:30:01.234Z",
  "duration": "PT1.234S",
  "succeeded": true,
  "steps": [
    { "name": "salary-reasoning", "duration": "PT0.800S", "succeeded": true, "detail": { "note": "Proposed salary is 12% below market median" } },
    { "name": "start-date-validation", "duration": "PT0.050S", "succeeded": true }
  ]
}
```

## REST API

| Method | Path | Description |
|---|---|---|
| GET | `/traces` | List recent traces (optional `?serviceId=` filter) |
| GET | `/traces/{traceId}` | Get a specific trace |
| GET | `/services/{id}/traces` | List traces for a service |
| GET | `/services/{id}/traces/latest` | Get the latest trace for a service |

## Schema

See [tracing.json](../../protocol/v1/schemas/observability/tracing.json).
