# Sprite Management API

## Schemas

### Sprite

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string (UUID) | yes | Unique sprite identifier |
| `name` | string | yes | Sprite name within the organization |
| `organization` | string | yes | Organization slug |
| `url` | string | yes | Sprite HTTP endpoint URL |
| `url_settings` | object | yes | URL access configuration |
| `status` | `"cold"` \| `"warm"` \| `"running"` | yes | Runtime status |
| `created_at` | string (ISO 8601) | yes | Creation timestamp |
| `updated_at` | string (ISO 8601) | yes | Last update timestamp |

### URLSettings

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `auth` | `"sprite"` \| `"public"` | no | Authentication type (default: sprite) |

### SpriteEntry

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | Sprite name |
| `org_slug` | string | yes | Organization slug |
| `updated_at` | string (ISO 8601) | no | Last update timestamp |

---

## Endpoints

### Create Sprite

```
POST /v1/sprites
```

Create a new sprite with a unique name in your organization.

#### Request body (`application/json`)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | Unique name for the sprite within the organization |
| `url_settings` | object | no | URL access configuration |
| `url_settings.auth` | `"sprite"` \| `"public"` | no | Authentication type (default: sprite) |

#### Response (`application/json`) — 201

Returns a `Sprite`.

#### Response codes

- **201 Created**
- **400 Invalid request parameters**
- **401 Missing or invalid authentication**

#### Example

```bash
curl -X POST "https://api.sprites.dev/v1/sprites" \
  -H "Authorization: Bearer $SPRITES_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"my-sprite","url_settings":{"auth":"public"}}'
```

```json
{
  "id": "01234567-89ab-cdef-0123-456789abcdef",
  "name": "my-dev-sprite",
  "status": "cold",
  "url": "https://name-random-alphanumeric.sprites.app",
  "updated_at": "2024-01-15T14:22:00Z",
  "created_at": "2024-01-15T10:30:00Z",
  "organization": "my-org",
  "url_settings": {
    "auth": "sprite"
  }
}
```

---

### List Sprites

```
GET /v1/sprites
```

List all sprites for the authenticated organization.

#### Query parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `prefix` | string | no | Filter sprites by name prefix |
| `max_results` | number | no | Maximum number of results (1–50, default: 50) |
| `continuation_token` | string | no | Token from previous response for pagination |

#### Response (`application/json`) — 200

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `sprites` | `SpriteEntry[]` | yes | List of sprite entries |
| `has_more` | boolean | yes | Whether more results are available |
| `next_continuation_token` | string | no | Token for fetching the next page of results |

#### Response codes

- **200 Success**
- **401 Missing or invalid authentication**

#### Example

```bash
curl -X GET "https://api.sprites.dev/v1/sprites" \
  -H "Authorization: Bearer $SPRITES_TOKEN"
```

```json
{
  "sprites": [
    {
      "name": "my-dev-sprite",
      "updated_at": "2024-01-15T14:22:00Z",
      "org_slug": "my-org"
    }
  ],
  "next_continuation_token": "eyJsYXN0IjoibXktZGV2LXNwcml0ZSJ9",
  "has_more": true
}
```

---

### Get Sprite

```
GET /v1/sprites/{name}
```

Get details for a specific sprite.

#### Path parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | yes | Unique sprite name |

#### Response (`application/json`) — 200

Returns a `Sprite`.

#### Response codes

- **200 Success**
- **401 Missing or invalid authentication**
- **404 Sprite not found**

#### Example

```bash
curl -X GET "https://api.sprites.dev/v1/sprites/{name}" \
  -H "Authorization: Bearer $SPRITES_TOKEN"
```

```json
{
  "id": "01234567-89ab-cdef-0123-456789abcdef",
  "name": "my-dev-sprite",
  "status": "cold",
  "url": "https://name-random-alphanumeric.sprites.app",
  "updated_at": "2024-01-15T14:22:00Z",
  "created_at": "2024-01-15T10:30:00Z",
  "organization": "my-org",
  "url_settings": {
    "auth": "sprite"
  }
}
```

---

### Update Sprite

```
PUT /v1/sprites/{name}
```

Update sprite settings such as URL authentication.

#### Path parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | yes | Unique sprite name |

#### Request body (`application/json`)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `url_settings` | object | yes | URL access configuration to update |
| `url_settings.auth` | `"sprite"` \| `"public"` | no | Authentication type (default: sprite) |

#### Response (`application/json`) — 200

Returns a `Sprite`.

#### Response codes

- **200 Success**
- **400 Invalid request parameters**
- **401 Missing or invalid authentication**
- **404 Sprite not found**

#### Example

```bash
curl -X PUT "https://api.sprites.dev/v1/sprites/{name}" \
  -H "Authorization: Bearer $SPRITES_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url_settings":{"auth":"public"}}'
```

```json
{
  "id": "01234567-89ab-cdef-0123-456789abcdef",
  "name": "my-dev-sprite",
  "status": "cold",
  "url": "https://name-random-alphanumeric.sprites.app",
  "updated_at": "2024-01-15T14:22:00Z",
  "created_at": "2024-01-15T10:30:00Z",
  "organization": "my-org",
  "url_settings": {
    "auth": "sprite"
  }
}
```

---

### Destroy Sprite

```
DELETE /v1/sprites/{name}
```

Delete a sprite and all associated resources.

#### Path parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | yes | Unique sprite name |

#### Response — 204

No content.

#### Response codes

- **204 No content**
- **401 Missing or invalid authentication**
- **404 Sprite not found**

#### Example

```bash
curl -X DELETE "https://api.sprites.dev/v1/sprites/{name}" \
  -H "Authorization: Bearer $SPRITES_TOKEN"
```
