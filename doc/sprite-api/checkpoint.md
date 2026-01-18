Checkpoints API

Checkpoint object

Checkpoint

Field	Type	Required	Description
id	string	yes	Checkpoint identifier (e.g., v7)
create_time	string	yes	When the checkpoint was created
source_id	string	no	Parent checkpoint ID
comment	string	no	User-provided description


⸻

Streaming NDJSON events

StreamInfoEvent

Field	Type	Required	Description
type	"info"	yes	Event type
data	string	yes	Status message
time	string (DateTime)	yes	Timestamp

StreamErrorEvent

Field	Type	Required	Description
type	"error"	yes	Event type
error	string	yes	Error description
time	string (DateTime)	yes	Timestamp

StreamCompleteEvent

Field	Type	Required	Description
type	"complete"	yes	Event type
data	string	yes	Completion message
time	string (DateTime)	yes	Timestamp


⸻

Create Checkpoint

POST /v1/sprites/{name}/checkpoint
Create a new checkpoint of the current sprite state. Returns streaming NDJSON progress.

Request body (application/json)

Field	Type	Required	Description
comment	string	no	Comment for the checkpoint

Response (application/x-ndjson) — 200

Streaming NDJSON events: StreamInfoEvent, StreamErrorEvent, StreamCompleteEvent.

Response codes
	•	200 Success — Streaming NDJSON response
	•	404 Not Found — Resource not found
	•	500 Internal Server Error

Example

curl -X POST "https://api.sprites.dev/v1/sprites/{name}/checkpoint" \
  -H "Authorization: Bearer $SPRITES_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"comment":"Before deploying v2.0"}'

[
  { "data": "Creating checkpoint...", "time": "2026-01-05T10:30:00Z", "type": "info" },
  { "data": "Stopping services...", "time": "2026-01-05T10:30:00Z", "type": "info" },
  { "data": "Saving filesystem state...", "time": "2026-01-05T10:30:00Z", "type": "info" },
  { "data": "Checkpoint v8 created", "time": "2026-01-05T10:30:00Z", "type": "complete" }
]


⸻

List Checkpoints

GET /v1/sprites/{name}/checkpoints
List all checkpoints.

Response (application/json) — 200

Array of Checkpoint.

Response codes
	•	200 Success
	•	404 Not Found — Resource not found
	•	500 Internal Server Error

Example

curl -X GET "https://api.sprites.dev/v1/sprites/{name}/checkpoints" \
  -H "Authorization: Bearer $SPRITES_TOKEN"

[
  { "comment": "Before database migration", "create_time": "2026-01-05T10:30:00Z", "id": "v7" },
  { "comment": "Stable state", "create_time": "2026-01-04T15:00:00Z", "id": "v6" },
  { "comment": "", "create_time": "2026-01-04T09:00:00Z", "id": "v5" }
]


⸻

Get Checkpoint

GET /v1/sprites/{name}/checkpoints/{checkpoint_id}
Get details of a specific checkpoint.

Path parameters

Name	Type	Required	Description
checkpoint_id	string	yes	Checkpoint identifier (e.g., v7)

Response (application/json) — 200

Returns a Checkpoint.

Response codes
	•	200 Success
	•	404 Not Found — Resource not found
	•	500 Internal Server Error

Example

curl -X GET "https://api.sprites.dev/v1/sprites/{name}/checkpoints/{checkpoint_id}" \
  -H "Authorization: Bearer $SPRITES_TOKEN"

{
  "comment": "Before database migration",
  "create_time": "2026-01-05T10:30:00Z",
  "id": "v7"
}


⸻

Restore Checkpoint

POST /v1/sprites/{name}/checkpoints/{checkpoint_id}/restore
Restore to a specific checkpoint. Returns streaming NDJSON progress.

Path parameters

Name	Type	Required	Description
checkpoint_id	string	yes	Checkpoint identifier (e.g., v7)

Response (application/x-ndjson) — 200

Streaming NDJSON events: StreamInfoEvent, StreamErrorEvent, StreamCompleteEvent.

Response codes
	•	200 Success — Streaming NDJSON response
	•	404 Not Found — Resource not found
	•	500 Internal Server Error

Example

curl -X POST "https://api.sprites.dev/v1/sprites/{name}/checkpoints/{checkpoint_id}/restore" \
  -H "Authorization: Bearer $SPRITES_TOKEN"

[
  { "data": "Restoring to checkpoint v5...", "time": "2026-01-05T10:30:00Z", "type": "info" },
  { "data": "Stopping services...", "time": "2026-01-05T10:30:00Z", "type": "info" },
  { "data": "Restoring filesystem...", "time": "2026-01-05T10:30:00Z", "type": "info" },
  { "data": "Restored to v5", "time": "2026-01-05T10:30:00Z", "type": "complete" }
]
