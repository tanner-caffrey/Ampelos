# Spatial Module

Spatial awareness and embodiment for Ampelos agents. Agents exist in persistent digital spaces with locations, navigation, and object interaction.

## Features

- **Persistent Worlds**: Define worlds with interconnected locations
- **Agent Location Tracking**: Know where each agent is at all times
- **Navigation**: Agents can move between connected locations
- **Object Interaction**: Place and interact with objects in locations
- **Hierarchical Spaces**: Locations can contain nested sub-spaces

## Configuration

| Option | Type | Description |
|--------|------|-------------|
| `worlds` | object | World definitions with locations and structure |

### World Structure

Each world contains:
- `name` - Display name
- `description` - Brief description
- `default_location` - Where agents spawn
- `locations` - Location definitions

### Location Structure

Each location contains:
- `description` - 1-3 sentence description
- `connections` - Array of connected location IDs
- `part_of` - Optional parent container

## Example Configuration

```json
{
  "spatial": {
    "worlds": {
      "home": {
        "name": "Home",
        "description": "A cozy digital home",
        "default_location": "living_room",
        "locations": {
          "living_room": {
            "description": "A warm living room with comfortable furniture",
            "connections": ["kitchen", "bedroom", "outside"]
          },
          "kitchen": {
            "description": "A functional kitchen with modern appliances",
            "connections": ["living_room"]
          },
          "bedroom": {
            "description": "A quiet bedroom for rest",
            "connections": ["living_room"]
          },
          "outside": {
            "description": "The world beyond the home",
            "connections": ["living_room"]
          }
        }
      }
    }
  }
}
```

## Default World

If no worlds are configured, agents start in "The Void" - an empty expanse waiting to be shaped.

## Tools Provided

### Navigation
- `look` - Observe current location and surroundings
- `move` - Move to a connected location
- `teleport` - Move directly to any location (admin)

### World Information
- `list_locations` - List all locations in current world
- `get_location` - Get details about a specific location
- `where_am_i` - Get agent's current location

### Object Interaction (via interact tool)
- `place_object` - Place an object in current location
- `take_object` - Pick up an object
- `examine_object` - Inspect an object in detail

## Use Cases

- **Roleplay**: Immersive environments for character-based agents
- **Game Worlds**: Explorable spaces with puzzles and items
- **Virtual Offices**: Agents can "be" in different rooms
- **Collaborative Spaces**: Shared environments for multi-agent scenarios
