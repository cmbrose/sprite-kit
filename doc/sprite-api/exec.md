Command Execution API

WebSocket exec protocol

Non-PTY binary frame format

Part	Size	Description
stream_id	1 byte	Stream identifier
payload	N bytes	Stream data

Stream IDs (non-PTY)

Stream ID	Name	Direction	Description
0	stdin	client → server	Standard input data
1	stdout	server → client	Standard output data
2	stderr	server → client	Standard error data
3	exit	server → client	Exit code (payload is exit code as byte)
4	stdin_eof	client → server	End of stdin stream

PTY mode binary behavior

In PTY mode, binary data is sent raw (no stream_id prefix).

JSON message types (WebSocket)

ResizeMessage (client → server)

Field	Type	Required	Description
type	"resize"	yes	Message type
cols	non_neg_integer	yes	New column count
rows	non_neg_integer	yes	New row count

SessionInfoMessage (server → client)

Field	Type	Required	Description
type	"session_info"	yes	Message type
session_id	integer	yes	Process PID
command	string	yes	Command being executed
created	integer	yes	Unix timestamp of session creation
cols	non_neg_integer	yes	Terminal columns (TTY mode only)
rows	non_neg_integer	yes	Terminal rows (TTY mode only)
is_owner	boolean	yes	Whether this attachment owns the session
tty	boolean	yes	Whether session is in TTY mode

ExitMessage (server → client)

Field	Type	Required	Description
type	"exit"	yes	Message type
exit_code	integer	yes	Process exit code

PortNotificationMessage (server → client)

Field	Type	Required	Description
type	"port_opened" | "port_closed"	yes	Notification type
port	integer	yes	Port number
address	string	yes	Proxy URL for accessing the port
pid	integer	yes	Process ID that opened/closed the port

Attach scrollback behavior

On attach, the server immediately sends the session’s scrollback buffer as stdout data.

⸻

Execute Command (WebSocket)

WSS /v1/sprites/{name}/exec
Execute a command in the sprite environment via WebSocket. Commands continue running after disconnect; use max_run_after_disconnect to control timeout. Supports TTY and non-TTY modes.

Query parameters (WebSocket connection)

Name	Type	Required	Description
cmd	string	yes	Command to execute (can be repeated for command + args)
id	string	no	Session ID to attach to an existing session
path	string	no	Explicit path to executable (defaults to first cmd value or bash)
tty	bool	no	Enable TTY mode (default: false)
stdin	bool	no	Enable stdin. TTY default: true, non-TTY default: false
cols	int	no	Initial terminal columns (default: 80)
rows	int	no	Initial terminal rows (default: 24)
max_run_after_disconnect	duration	no	Max time to run after disconnect. TTY default: 0 (forever), non-TTY default: 10s
env	string	no	Environment variables in KEY=VALUE format (can be repeated). If set, replaces the default environment.

Response codes
	•	101 Switching Protocols — WebSocket connection established
	•	400 Bad Request — Invalid WebSocket upgrade or missing parameters
	•	404 Not Found — Resource not found

Example

websocat \
  "wss://api.sprites.dev/v1/sprites/{name}/exec?path=/bin/bash&tty=true" \
  -H "Authorization: Bearer $SPRITES_TOKEN"

JSON examples:

{"type":"resize","cols":120,"rows":40}

{"type":"port_opened","port":8080,"address":"0.0.0.0","pid":1234}


⸻

List Exec Sessions

GET /v1/sprites/{name}/exec
List active exec sessions.

Response (application/json) — 200

Array of session entries.

ExecSessionEntry

Field	Type	Required	Description
bytes_per_second	number	yes	Throughput
command	string	yes	Command
created	string (ISO 8601)	yes	Creation timestamp
id	integer	yes	Session ID
is_active	boolean	yes	Whether session is active
last_activity	string (ISO 8601)	yes	Last activity timestamp
tty	boolean	yes	Whether session is TTY
workdir	string	yes	Working directory

Response codes
	•	200 Success
	•	404 Not Found — Resource not found
	•	500 Internal Server Error

Example

curl -X GET "https://api.sprites.dev/v1/sprites/{name}/exec" \
  -H "Authorization: Bearer $SPRITES_TOKEN"

[
  {
    "bytes_per_second": 125.5,
    "command": "bash",
    "created": "2026-01-05T10:30:00Z",
    "id": 1847,
    "is_active": true,
    "last_activity": "2026-01-05T10:35:00Z",
    "tty": true,
    "workdir": "/home/sprite/myproject"
  },
  {
    "bytes_per_second": 0,
    "command": "python -m http.server 8000",
    "created": "2026-01-05T09:15:00Z",
    "id": 1923,
    "is_active": false,
    "last_activity": "2026-01-05T09:20:00Z",
    "tty": false,
    "workdir": "/home/sprite/webapp"
  }
]


⸻

Execute Command (HTTP)

POST /v1/sprites/{name}/exec
Execute a command via simple HTTP POST (non-TTY only).

Query parameters

Name	Type	Required	Description
cmd	string	yes	Command to execute (can be repeated for command + args)
path	string	no	Explicit path to executable (defaults to first cmd value or bash)
stdin	bool	no	Enable stdin from request body (default: false)
env	string	no	Environment variables in KEY=VALUE format (can be repeated)
dir	string	no	Working directory for the command

Response (application/json) — 200

Response body not specified.

Response codes
	•	200 Success
	•	400 Bad Request — Invalid request body
	•	404 Not Found — Resource not found
	•	500 Internal Server Error

Example

curl -X POST "https://api.sprites.dev/v1/sprites/{name}/exec" \
  -H "Authorization: Bearer $SPRITES_TOKEN"


⸻

Attach to Exec Session (WebSocket)

WSS /v1/sprites/{name}/exec/{session_id}
Attach to an existing exec session via WebSocket.

JSON messages

Same as WebSocket exec protocol (ResizeMessage, SessionInfoMessage, ExitMessage).

Response codes
	•	101 Switching Protocols — WebSocket connection established
	•	400 Bad Request — Invalid WebSocket upgrade or missing parameters
	•	404 Not Found — Resource not found

Example

websocat \
  "wss://api.sprites.dev/v1/sprites/{name}/exec/{session_id}" \
  -H "Authorization: Bearer $SPRITES_TOKEN"


⸻

Kill Exec Session

POST /v1/sprites/{name}/exec/{session_id}/kill
Kill an exec session by session ID. Returns streaming NDJSON with kill progress.

Query parameters

Name	Type	Required	Description
signal	string	no	Signal to send (default: SIGTERM)
timeout	duration	no	Timeout waiting for process to exit (default: 10s)

Response (application/x-ndjson) — 200

Streaming NDJSON events.

ExecKillSignalEvent

Field	Type	Required	Description
type	"signal"	yes	Event type
message	string	yes	Status message
signal	string	yes	Signal name (e.g., SIGTERM)
pid	integer	yes	Target process ID

ExecKillTimeoutEvent

Field	Type	Required	Description
type	"timeout"	yes	Event type
message	string	yes	Status message

ExecKillExitedEvent

Field	Type	Required	Description
type	"exited"	yes	Event type
message	string	yes	Status message

ExecKillKilledEvent

Field	Type	Required	Description
type	"killed"	yes	Event type
message	string	yes	Status message

ExecKillErrorEvent

Field	Type	Required	Description
type	"error"	yes	Event type
message	string	yes	Error message

ExecKillCompleteEvent

Field	Type	Required	Description
type	"complete"	yes	Event type
exit_code	integer	yes	Process exit code

Response codes
	•	200 Success — Streaming NDJSON response
	•	404 Not Found — Resource not found
	•	500 Internal Server Error

Example

curl -X POST "https://api.sprites.dev/v1/sprites/{name}/exec/{session_id}/kill" \
  -H "Authorization: Bearer $SPRITES_TOKEN"

[
  {
    "message": "Signaling SIGTERM to process group 1847",
    "pid": 1847,
    "signal": "SIGTERM",
    "type": "signal"
  },
  {
    "message": "Process exited",
    "type": "exited"
  },
  {
    "exit_code": 0,
    "type": "complete"
  }
]
