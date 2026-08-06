# API Reference

Base URL: `http://localhost:3000/api/v1` (development)

All responses follow this envelope:

```json
{
  "success": true,
  "data": { ... }
}
```

On error:

```json
{
  "success": false,
  "error": "Human-readable error message"
}
```

---

## GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-03-15T10:00:00.000Z",
  "uptime": 3600.5,
  "environment": "development"
}
```

---

## GET /courts

Returns all active courts from Supabase.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid-here",
      "name": "Pickleballers Space Tagum",
      "address": "Tagum City, Davao del Norte",
      "latitude": 7.4478,
      "longitude": 125.8087,
      "website": "https://pickleballers.com/book",
      "phone": "+63 9XX XXX XXXX",
      "facebook": "https://facebook.com/pickleballersspa",
      "image": null,
      "active": true,
      "parser_name": "pickleballers"
    }
  ]
}
```

---

## GET /court/:id

Returns a single court by UUID.

**Parameters:**
- `id` (path) — Court UUID

**Response:** Same structure as a single item from `/courts`.

**Error (404):**
```json
{
  "success": false,
  "error": "Court not found: <id>"
}
```

---

## GET /availability

Checks availability across all courts with a configured parser for the given date.

**Query Parameters:**
- `date` (optional) — Date in `YYYY-MM-DD` format. Defaults to today.

**Response:**
```json
{
  "success": true,
  "data": {
    "date": "2024-03-15",
    "fetchedAt": "2024-03-15T10:00:00.000Z",
    "results": [
      {
        "courtId": "uuid-here",
        "courtName": "Pickleballers Space Tagum",
        "date": "2024-03-15",
        "slots": [
          {
            "startTime": "08:00",
            "endTime": "09:00",
            "label": "8:00 AM – 9:00 AM",
            "available": true,
            "price": "₱150"
          },
          {
            "startTime": "09:00",
            "endTime": "10:00",
            "label": "9:00 AM – 10:00 AM",
            "available": false,
            "price": "₱150"
          }
        ],
        "sourceUrl": "https://pickleballers.com/book?date=2024-03-15",
        "lastChecked": "2024-03-15T10:00:01.234Z",
        "error": null
      },
      {
        "courtId": "uuid-here-2",
        "courtName": "The Hideout",
        "date": "2024-03-15",
        "slots": [],
        "sourceUrl": "https://thehideout-tagum.com/book?date=2024-03-15",
        "lastChecked": "2024-03-15T10:00:02.100Z",
        "error": "Could not reach The Hideout: Request timeout"
      }
    ],
    "grouped": [
      {
        "time": "8:00 AM – 9:00 AM",
        "courts": [
          {
            "courtId": "uuid-here",
            "courtName": "Pickleballers Space Tagum",
            "available": true,
            "price": "₱150"
          }
        ]
      }
    ]
  }
}
```

**Notes:**
- Results with `error != null` indicate a parser failure (site unreachable, HTML changed, etc.)
- The `grouped` array groups results by time slot — used by the Search screen
- Response time depends on external website speeds (typically 2–15 seconds)

---

## Error Codes

| HTTP Status | Meaning |
|-------------|---------|
| 200 | Success |
| 400 | Bad request (invalid date format, missing parameter) |
| 404 | Resource not found |
| 500 | Internal server error |
