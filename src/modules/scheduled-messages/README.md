# Scheduled Messages Module

Scheduled and recurring messages for agents. Supports time-based and loop-based triggers for automated messaging.

## Features

- **Time-Based Scheduling**: Schedule messages for specific times
- **Recurring Messages**: Set up repeating message schedules
- **Loop-Based Triggers**: Trigger messages after N iterations
- **Multiple Schedules**: Maintain multiple active schedules
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

## Tools Provided

### Schedule Management
- `create_schedule` - Create a new scheduled message
- `list_schedules` - List all active schedules
- `cancel_schedule` - Cancel a scheduled message
- `update_schedule` - Modify an existing schedule

### Schedule Types

#### Time-Based
Schedule messages to send at specific intervals:
- Every N minutes/hours/days
- At specific times of day
- On specific days of the week

#### Loop-Based
Schedule messages to send after N events:
- After N user messages
- After N agent responses
- After N tool calls

## Use Cases

- **Daily Briefings**: Send morning summaries
- **Reminders**: Periodic check-ins with users
- **Maintenance Tasks**: Scheduled cleanup or updates
- **Engagement**: Regular interaction prompts
