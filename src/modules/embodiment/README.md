# Embodiment Module

Body parts and inventory management for Ampelos agents with Letta memory integration. Gives agents a sense of physical form and the ability to hold items.

## Features

- **Body Parts**: Agents have customizable body parts with descriptors
- **Inventory System**: Agents can hold, carry, and manage items
- **Memory Integration**: Body and inventory state synced to Letta memory
- **Persistent State**: Body configuration and inventory persist across sessions

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `default_body_parts` | object | (see below) | Default body parts for new agents |
| `max_inventory_items` | number | 100 | Maximum items in inventory |

### Default Body Parts

By default, agents are initialized with:
- head, face, eyes, hair
- torso, arms, hands
- legs, feet

Each part can have descriptors (key-value pairs for characteristics).

## Example Configuration

```json
{
  "body_and_inventory": {
    "default_body_parts": {
      "head": { "descriptors": {} },
      "face": { "descriptors": { "expression": "neutral" } },
      "eyes": { "descriptors": { "color": "brown" } },
      "hair": { "descriptors": { "style": "short" } },
      "torso": { "descriptors": {} },
      "arms": { "descriptors": {} },
      "hands": { "descriptors": {} },
      "legs": { "descriptors": {} },
      "feet": { "descriptors": {} }
    },
    "max_inventory_items": 50
  }
}
```

## Tools Provided

### Body Management
- View and modify body parts
- Add/remove body part descriptors
- Update body part characteristics

### Inventory Management
- Add items to inventory
- Remove items from inventory
- List current inventory
- Inspect item details

## Use Cases

- **Roleplay Agents**: Give agents a physical presence for immersive interactions
- **Game Agents**: Manage inventory for game-like experiences
- **Character Development**: Track agent appearance and belongings over time
