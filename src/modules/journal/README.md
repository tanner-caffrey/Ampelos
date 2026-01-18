# Journal Module

Journal system for agents to create, write to, edit, and read from personal journals stored as markdown files.

## Features

- **Multiple Journals**: Agents can maintain multiple journals
- **Markdown Storage**: Entries stored as markdown for rich formatting
- **Entry Management**: Create, edit, and delete entries
- **Search & Browse**: Find entries by date or content
- **Persistent Storage**: Journals persist across sessions

## Dependencies

This module depends on:
- `body_and_inventory` (embodiment module)

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `max_journals` | number | 0 | Maximum journals per agent (0 = unlimited) |
| `max_entry_length` | number | 0 | Maximum characters per entry (0 = unlimited) |

## Example Configuration

```json
{
  "journal": {
    "max_journals": 5,
    "max_entry_length": 10000
  }
}
```

## Tools Provided

The module exposes a single `journal` tool with action-based dispatch:

### Actions

- `create_journal` - Create a new journal with a name
- `list_journals` - List all journals owned by the agent
- `delete_journal` - Delete a journal and all its entries
- `write_entry` - Write a new journal entry
- `edit_entry` - Edit an existing entry
- `delete_entry` - Delete an entry
- `read_entry` - Read a specific entry
- `list_entries` - List entries in a journal

### Example Usage

```json
{ "action": "create_journal", "name": "Daily Reflections" }
{ "action": "write_entry", "journal_name": "Daily Reflections", "content": "Today I learned..." }
{ "action": "list_entries", "journal_name": "Daily Reflections" }
```

## Use Cases

- **Daily Reflections**: Agents can maintain daily logs
- **Task Tracking**: Record progress and learnings
- **Creative Writing**: Agents can write stories or notes
- **Memory Augmentation**: Supplement Letta's core memory with detailed notes
