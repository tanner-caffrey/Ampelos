# Scheduled Messages Module

Scheduled and recurring messages for agents. Supports time-based intervals, one-time triggers, and cron-like recurring patterns.

## Features

- **Interval Scheduling**: Repeat messages at regular intervals
- **One-Time Triggers**: Schedule a message for a specific future time
- **Recurring Patterns**: Cron-like patterns (daily, weekly, monthly)
- **Loop-Based Triggers**: Trigger after N user/agent interactions
- **Timezone Aware**: Handles timezone conversions automatically
- **Persistent State**: Schedules survive server restarts

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `max_schedules` | number | 10 | Maximum concurrent schedules (0 = unlimited) |
| `min_interval_seconds` | number | 60 | Minimum interval for time-based schedules |

## Example Configuration

```json
{
  "scheduled-messages": {
    "max_schedules": 5,
    "min_interval_seconds": 300
  }
}
```

## Schedule Types

### `time` - Recurring Interval
Schedule messages at regular intervals:

```json
{
  "action": "create",
  "type": "time",
  "interval": 3600,
  "message": "Hourly check-in"
}
```

### `once_delay` - One-Time After Delay
Send a single message after a delay:

```json
{
  "action": "create",
  "type": "once_delay",
  "interval": 300,
  "message": "Reminder in 5 minutes"
}
```

### `once_at` - One-Time at Specific Time
Send a single message at an exact time:

```json
{
  "action": "create",
  "type": "once_at",
  "fire_at": "2024-12-25T09:00:00-05:00",
  "message": "Merry Christmas!"
}
```

Timestamps can be:
- With timezone: `2024-12-25T09:00:00-05:00` (used as-is)
- Without timezone: `2024-12-25T09:00:00` (interpreted as server local time)

### `recurring_at` - Cron-Like Patterns
Schedule messages using recurring patterns:

```json
{
  "action": "create",
  "type": "recurring_at",
  "recurring_pattern": {
    "type": "daily",
    "times": ["09:00", "17:00"],
    "timezone": "America/New_York"
  },
  "message": "Daily morning and evening check-in"
}
```

#### Pattern Types

**Daily** - Fire at specific times each day:
```json
{
  "type": "daily",
  "times": ["09:00", "12:00", "17:00"],
  "timezone": "America/New_York"
}
```

**Weekly** - Fire on specific days at specific times:
```json
{
  "type": "weekly",
  "days": ["monday", "wednesday", "friday"],
  "times": ["10:00"],
  "timezone": "America/New_York"
}
```

**Monthly** - Fire on specific days of the month:
```json
{
  "type": "monthly",
  "days_of_month": [1, 15],
  "times": ["09:00"],
  "timezone": "America/New_York"
}
```

**Interval** - Fire at regular intervals (like `time` but with pattern structure):
```json
{
  "type": "interval",
  "interval_seconds": 3600
}
```

### `loop` - Interaction-Based
Fire after N user messages or agent responses:

```json
{
  "action": "create",
  "type": "loop",
  "interval": 10,
  "message": "Every 10 interactions, check in"
}
```

## Tools Provided

### Schedule Management
- `create` - Create a new scheduled message
- `list` - List all active schedules
- `cancel` - Cancel a scheduled message by ID
- `update` - Modify an existing schedule

## Automatic Cleanup

One-time schedules (`once_delay`, `once_at`) are automatically removed after firing. Recurring schedules (`time`, `recurring_at`, `loop`) continue until cancelled.

## Use Cases

- **Daily Briefings**: `recurring_at` with daily pattern at 9am
- **Reminders**: `once_at` for specific appointment times
- **Periodic Check-ins**: `time` for regular interval messages
- **Follow-up Prompts**: `once_delay` to check back after a conversation
- **Weekly Reports**: `recurring_at` with weekly pattern on Fridays

## Technical Notes

- Long delays (> 24 hours) use chained timers to avoid JavaScript setTimeout limits
- Missed schedules (server was down) fire immediately on restart
- Timezone handling uses IANA timezone names (e.g., "America/New_York")
